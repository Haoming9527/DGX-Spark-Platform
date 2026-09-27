package ai

import (
	"context"
	"log"
	"net/http"
)

func (s *Server) routes() http.Handler {
	pool, ollaURL := s.pool, s.ollaURL
	chatServiceKey, adminServiceKey := s.config.ChatKey, s.config.AdminKey
	promptStore := loadSystemPromptStore(s.config.PromptFile)
	proxy := newOllaProxy(ollaURL)
	mux := http.NewServeMux()
	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := authorizedRequest(w, r, pool, chatServiceKey, adminServiceKey); !ok {
			return
		}
		writeCapacityStatus(w, ollaURL)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		ident, ok := authorizedRequest(w, r, pool, chatServiceKey, adminServiceKey)
		if !ok {
			return
		}
		admin := ident.role == "admin"
		requestedModel := peekRequestModel(r)
		gate := loadGate(r.Context(), pool, ollaURL, admin)
		if gate.databaseUnavailable {
			writeOpenAIError(w, http.StatusServiceUnavailable, "Model access service unavailable.", "server_error", nil)
			return
		}
		if gate.failClosed {
			if kind, ok := liveModelListKind(r); ok {
				if admin {
					writeLiveModelList(w, ollaURL, kind, map[string]struct{}{}, true)
					return
				}
				w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
				if kind == "openai" {
					writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": []any{}})
					return
				}
				writeJSON(w, http.StatusOK, ollamaTagsResponse{Models: []map[string]any{}})
				return
			}
			writeLocalModelNotFound(w)
			return
		}

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		usageModel := ""
		if kind, ok := liveModelListKind(r); ok {
			writeLiveModelList(rec, ollaURL, kind, gate.restricted, admin)
		} else {
			restrictedHit := requestedModel != "" && isRestrictedName(requestedModel, gate.restricted)
			allowed := requestedModel != "" && modelOnAllowlist(requestedModel, gate.live, gate.restricted, admin)
			if !allowed {
				writeLocalModelNotFound(rec)
			} else {
				usageModel = requestedModel
				isChat := shouldInjectSystemPrompt(r)
				if isChat && !restrictedHit {
					if err := injectSystemPrompt(r, promptStore.get()); err != nil {
						log.Printf("system prompt inject failed: %v", err)
						writeOpenAIError(rec, http.StatusBadRequest, "Invalid request body.", "invalid_request_error", nil)
						isChat = false
						r = nil
					}
				}
				if r != nil && isChat {
					prepared, err := prepareChatPayload(r)
					if err != nil {
						writeOpenAIError(rec, http.StatusBadRequest, err.Error(), "invalid_request_error", nil)
					} else {
						r = prepared
						prepared, err = prepareStructuredOutput(r)
						if err != nil {
							writeOpenAIError(rec, http.StatusBadRequest, err.Error(), "invalid_request_error", nil)
						} else {
							proxy.ServeHTTP(rec, prepared)
						}
					}
				} else if r != nil {
					proxy.ServeHTTP(rec, r)
				}
			}
		}
		if ident.keyID != "" && pool != nil {
			go logUsage(context.Background(), pool, ident.keyID, rec.status, usageModel)
		}
	})

	return mux
}
