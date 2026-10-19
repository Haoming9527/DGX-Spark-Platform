// Package ai serves inference independently of infrastructure monitoring.
package ai

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/admission"
	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/ratelimit"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Failed authentication attempts allowed per client IP per minute before the database is skipped.
const failedAuthPerMinute = 20

type Config struct {
	OllaURL     string
	DatabaseURL string
	ChatKey     string
	AdminKey    string
	PromptFile  string
	Admission   *admission.Gate
	// Limits for personal API keys; service keys are exempt. Zero disables a limit.
	KeyRequestsPerMinute int
	KeyConcurrency       int
	// DBMaxConns overrides the pgx pool size when positive.
	DBMaxConns int32
}

type Server struct {
	config         Config
	pool           *pgxpool.Pool
	ollaURL        *url.URL
	handler        http.Handler
	failedAuth     *ratelimit.Window
	keyRequests    *ratelimit.Window
	keyConcurrency *ratelimit.Concurrency
}

func New(ctx context.Context, config Config) (*Server, error) {
	if config.DatabaseURL == "" && config.ChatKey == "" && config.AdminKey == "" {
		return nil, fmt.Errorf("AI requires DATABASE_URL, CHAT_SERVICE_KEY or ADMIN_SERVICE_KEY")
	}
	if config.ChatKey != "" && config.ChatKey == config.AdminKey {
		return nil, fmt.Errorf("ADMIN_SERVICE_KEY must differ from CHAT_SERVICE_KEY")
	}
	upstream, err := url.Parse(config.OllaURL)
	if err != nil || upstream.Host == "" || (upstream.Scheme != "http" && upstream.Scheme != "https") {
		return nil, fmt.Errorf("OLLA_URL must be an HTTP(S) URL")
	}
	if config.Admission == nil {
		config.Admission = admission.New()
	}
	s := &Server{
		config:         config,
		ollaURL:        upstream,
		failedAuth:     ratelimit.NewWindow(failedAuthPerMinute, time.Minute),
		keyRequests:    ratelimit.NewWindow(config.KeyRequestsPerMinute, time.Minute),
		keyConcurrency: ratelimit.NewConcurrency(config.KeyConcurrency),
	}
	if config.DatabaseURL != "" {
		pc, err := pgxpool.ParseConfig(config.DatabaseURL)
		if err != nil {
			return nil, fmt.Errorf("invalid DATABASE_URL configuration")
		}
		pc.ConnConfig.ConnectTimeout = 5 * time.Second
		if config.DBMaxConns > 0 {
			pc.MaxConns = config.DBMaxConns
		}
		// No startup Ping: acquisitions connect on demand and retry after failure.
		// An unreachable database must not prevent the infra listener starting.
		s.pool, err = pgxpool.NewWithConfig(ctx, pc)
		if err != nil {
			return nil, fmt.Errorf("initialize AI database pool: %w", err)
		}
	}
	s.handler = s.routes()
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.handler.ServeHTTP(w, r) }
func (s *Server) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}
