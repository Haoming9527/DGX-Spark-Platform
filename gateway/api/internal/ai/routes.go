package ai

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
)

func (s *Server) routes() http.Handler {
	pool, ollaURL := s.pool, s.ollaURL
	chatServiceKey, adminServiceKey := s.config.ChatKey, s.config.AdminKey
	promptStore := loadSystemPromptStore(s.config.PromptFile)
	proxy := newOllaProxy(ollaURL)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ident, ok := authorizedRequest(w, r, pool, chatServiceKey, adminServiceKey)
		if !ok {
			return
		}
		r.URL.Path = strings.TrimSuffix(r.URL.Path, "/")
		r.URL.RawPath = ""
		if r.URL.Path == "/status" {
			if r.Method != http.MethodGet {
				w.Header().Set("Allow", "GET")
				writeOpenAIError(w, http.StatusMethodNotAllowed, "Method not allowed.", "invalid_request_error", nil)
				return
			}
			writeCapacityStatus(w, ollaURL)
			return
		}
		if kind, listing := liveModelListKind(r); listing {
			admin := ident.role == "admin"
			restricted, available := loadRestricted(r.Context(), pool)
			if !available && !admin {
				writeOpenAIError(w, http.StatusServiceUnavailable, "Model access service unavailable.", "server_error", nil)
				return
			}
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			writeLiveModelList(r.Context(), rec, ollaURL, kind, restricted, admin)
			if ident.keyID != "" && pool != nil {
				go logUsage(context.Background(), pool, ident.keyID, rec.status, "", tokenUsage{})
			}
			return
		}
		if !inferencePath(r.URL.Path) {
			writeOpenAIError(w, http.StatusNotFound, "Endpoint not found.", "invalid_request_error", nil)
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			writeOpenAIError(w, http.StatusMethodNotAllowed, "Method not allowed.", "invalid_request_error", nil)
			return
		}
		release, admitted := s.config.Admission.Enter()
		if !admitted {
			_, reason := s.config.Admission.Snapshot()
			if reason == "" {
				reason = "Spark is temporarily unavailable. Please try again."
			}
			writeOpenAIError(w, http.StatusServiceUnavailable, reason, "server_error", nil)
			return
		}
		defer release()
		requestedModel, err := readRequestModel(w, r)
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				writeOpenAIError(w, http.StatusRequestEntityTooLarge, requestLimitMessage(tooLarge.Limit), "invalid_request_error", nil)
			} else {
				writeOpenAIError(w, http.StatusBadRequest, "Invalid request body: "+err.Error(), "invalid_request_error", nil)
			}
			return
		}
		admin := ident.role == "admin"
		gate := loadGate(r.Context(), pool, ollaURL, admin)
		if gate.databaseUnavailable {
			writeOpenAIError(w, http.StatusServiceUnavailable, "Model access service unavailable.", "server_error", nil)
			return
		}
		if gate.failClosed {
			writeLocalModelNotFound(w)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		usageModel := ""
		if ident.keyID != "" && pool != nil {
			rec.usage = &usageCapture{}
			defer func() {
				rec.usage.finish()
				go logUsage(context.Background(), pool, ident.keyID, rec.status, usageModel, rec.usage.tokens)
			}()
		}
		if !modelOnAllowlist(requestedModel, gate.live, gate.restricted, admin) {
			writeLocalModelNotFound(rec)
		} else {
			usageModel = requestedModel
			if systemOnePath(r.URL.Path) {
				proxy.ServeHTTP(rec, r)
				return
			}
			if textGenerationPath(r.URL.Path) && decisionModelForRequest(r.Context(), ollaURL, requestedModel, gate.live) {
				writeOpenAIError(rec, http.StatusBadRequest,
					"This model supports System One decisions, not chat or text generation. Use POST /v1/systemone.",
					"invalid_request_error", strPtr("model_endpoint_mismatch"))
				return
			}
			if shouldInjectSystemPrompt(r) {
				if !isRestrictedName(requestedModel, gate.restricted) {
					if err := injectSystemPrompt(r, promptStore.get()); err != nil {
						log.Printf("system prompt inject failed: %v", err)
						writeOpenAIError(rec, http.StatusBadRequest, "Invalid request body.", "invalid_request_error", nil)
						r = nil
					}
				}
				if r != nil {
					prepared, err := prepareChatPayload(r)
					if err == nil {
						prepared, err = prepareStructuredOutput(prepared)
					}
					if err != nil {
						writeOpenAIError(rec, http.StatusBadRequest, err.Error(), "invalid_request_error", nil)
					} else {
						proxy.ServeHTTP(rec, prepared)
					}
				}
			} else {
				prepared, err := prepareGenerationImages(r)
				if err != nil {
					writeOpenAIError(rec, http.StatusBadRequest, err.Error(), "invalid_request_error", nil)
				} else {
					proxy.ServeHTTP(rec, prepared)
				}
			}
		}
	})
}
