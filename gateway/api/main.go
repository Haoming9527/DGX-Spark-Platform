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
	promptStore := loadSystemPromptStore(envOr("SYSTEM_PROMPT_FILE", "/config/system-prompt.md"))

	if databaseURL == "" && chatServiceKey == "" {
		log.Fatal("DATABASE_URL and/or CHAT_SERVICE_KEY is required")
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
		if _, ok := authorize(r.Context(), pool, chatServiceKey, r); !ok {
			writeOpenAIError(w, http.StatusUnauthorized, "Invalid API key.", "invalid_request_error", strPtr("invalid_api_key"))
			return
		}
		writeCapacityStatus(w, ollaURL)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		keyID, ok := authorize(r.Context(), pool, chatServiceKey, r)
		if !ok {
			writeOpenAIError(w, http.StatusUnauthorized, "Invalid API key.", "invalid_request_error", strPtr("invalid_api_key"))
			return
		}
		if shouldInjectSystemPrompt(r) {
			if err := injectSystemPrompt(r, promptStore.get()); err != nil {
				log.Printf("system prompt inject failed: %v", err)
				writeOpenAIError(w, http.StatusBadRequest, "Invalid request body.", "invalid_request_error", nil)
				return
			}
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		proxy.ServeHTTP(rec, r)
		if keyID != "" && pool != nil {
			go logUsage(context.Background(), pool, keyID, rec.status)
		}
	})

	server := &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("dgx-api listening on %s → %s (chat service key: %v, db: %v)",
			listenAddr, ollaURLRaw, chatServiceKey != "", pool != nil)
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
