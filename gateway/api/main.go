package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	listenAddr := envOr("API_LISTEN", ":8080")
	ollaURLRaw := envOr("OLLA_URL", "http://127.0.0.1:40114")
	databaseURL := os.Getenv("DATABASE_URL")
	chatServiceKey := os.Getenv("CHAT_SERVICE_KEY")
	adminServiceKey := os.Getenv("ADMIN_SERVICE_KEY")
	promptStore := loadSystemPromptStore(envOr("SYSTEM_PROMPT_FILE", "/config/system-prompt.md"))

	if databaseURL == "" && chatServiceKey == "" {
		log.Fatal("DATABASE_URL and/or CHAT_SERVICE_KEY is required")
	}
	if chatServiceKey != "" && adminServiceKey != "" && chatServiceKey == adminServiceKey {
		log.Fatal("ADMIN_SERVICE_KEY must differ from CHAT_SERVICE_KEY")
	}

	ollaURL, err := url.Parse(ollaURLRaw)
	if err != nil {
		log.Fatalf("invalid OLLA_URL: %v", err)
	}

	ctx := context.Background()
	var pool *pgxpool.Pool
	if databaseURL != "" {
		pool, err = pgxpool.New(ctx, databaseURL)
		if err != nil {
			log.Fatalf("database connect: %v", err)
		}
		defer pool.Close()
		if err := pool.Ping(ctx); err != nil {
			log.Fatalf("database ping: %v", err)
		}
	}

	proxy := newOllaProxy(ollaURL)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		if ident := authorize(r.Context(), pool, chatServiceKey, adminServiceKey, r); !ident.ok {
			writeOpenAIError(w, http.StatusUnauthorized, "Invalid API key.", "invalid_request_error", strPtr("invalid_api_key"))
			return
		}
		writeCapacityStatus(w, ollaURL)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		ident := authorize(r.Context(), pool, chatServiceKey, adminServiceKey, r)
		if !ident.ok {
			writeOpenAIError(w, http.StatusUnauthorized, "Invalid API key.", "invalid_request_error", strPtr("invalid_api_key"))
			return
		}
		admin := ident.role == "admin"
		requestedModel := peekRequestModel(r)
		gate := loadGate(r.Context(), pool, ollaURL, admin)
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
				if restrictedHit {
					go auditRestricted(context.Background(), pool, ident, requestedModel, "deny", r.URL.Path, http.StatusNotFound)
				}
				writeLocalModelNotFound(rec)
			} else {
				if restrictedHit {
					go auditRestricted(context.Background(), pool, ident, requestedModel, "allow", r.URL.Path, http.StatusOK)
				}
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

	server := &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("dgx-api listening on %s → %s (chat service key: %v, admin service key: %v, db: %v)",
			listenAddr, ollaURLRaw, chatServiceKey != "", adminServiceKey != "", pool != nil)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
