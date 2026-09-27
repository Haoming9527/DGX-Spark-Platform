package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/ai"
	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/infra/power"
	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/infra/spark"
)

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	powerConfig, err := power.LoadConfig(os.Getenv)
	if err != nil {
		return err
	}
	monitor := power.New(powerConfig)
	mux.Handle("/infra/pi-power", power.Handler(monitor, powerConfig.ReadKey))
	sparkController := spark.New(ctx, spark.LoadConfig(os.Getenv, powerConfig))
	mux.Handle("/infra/dgx-spark", sparkController.Handler())
	mux.Handle("/infra/dgx-spark/actions", sparkController.Handler())
	// Unknown infrastructure paths must never enter model dispatch.
	mux.HandleFunc("/infra/", http.NotFound)

	inference, err := ai.New(ctx, ai.Config{
		OllaURL:     envOr("OLLA_URL", "http://127.0.0.1:40114"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		ChatKey:     os.Getenv("CHAT_SERVICE_KEY"),
		AdminKey:    os.Getenv("ADMIN_SERVICE_KEY"),
		PromptFile:  envOr("SYSTEM_PROMPT_FILE", "/config/system-prompt.md"),
	})
	if err != nil {
		return err
	}
	defer inference.Close()
	mux.Handle("/", inference)

	server := &http.Server{
		Addr: envOr("API_LISTEN", ":8080"), Handler: mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("gateway listening on %s", server.Addr)
		serverErr <- server.ListenAndServe()
	}()
	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	stop() // Cancel any pending Spark cutoff before draining HTTP requests.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
