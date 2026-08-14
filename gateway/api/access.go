package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const restrictedCacheTTL = 30 * time.Second

type restrictedCatalog struct {
	mu    sync.Mutex
	names map[string]struct{}
	at    time.Time
	ok    bool
}

var restrictedStore restrictedCatalog

func normalizeModel(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ":latest") {
		return name[:len(name)-len(":latest")]
	}
	return name
}

func (c *restrictedCatalog) load(ctx context.Context, pool *pgxpool.Pool) (map[string]struct{}, bool) {
	c.mu.Lock()
	if c.ok && time.Since(c.at) < restrictedCacheTTL {
		out := c.names
		c.mu.Unlock()
		return out, true
	}
	c.mu.Unlock()

	if pool == nil {
		return nil, false
	}

	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	rows, err := pool.Query(ctx, `SELECT model_name FROM restricted_models`)
	if err != nil {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.ok {
			return c.names, true
		}
		return nil, false
	}
	defer rows.Close()

	next := make(map[string]struct{})
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			c.mu.Lock()
			defer c.mu.Unlock()
			if c.ok {
				return c.names, true
			}
			return nil, false
		}
		if n := normalizeModel(name); n != "" {
			next[n] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.ok {
			return c.names, true
		}
		return nil, false
	}

	c.mu.Lock()
	c.names = next
	c.at = time.Now()
	c.ok = true
	c.mu.Unlock()
	return next, true
}

func invalidateRestrictedCache() {
	restrictedStore.mu.Lock()
	restrictedStore.ok = false
	restrictedStore.names = nil
	restrictedStore.mu.Unlock()
}

func isRestrictedName(name string, set map[string]struct{}) bool {
	_, ok := set[normalizeModel(name)]
	return ok
}

func peekRequestModel(r *http.Request) string {
	if q := normalizeModel(r.URL.Query().Get("model")); q != "" {
		return q
	}
	if r.Body == nil || r.Method == http.MethodGet || r.Method == http.MethodHead {
		return ""
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
	_ = r.Body.Close()
	r.Body = io.NopCloser(bytes.NewReader(raw))
	if err != nil || len(bytes.TrimSpace(raw)) == 0 {
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	for _, key := range []string{"model", "name"} {
		if s, ok := payload[key].(string); ok {
			if n := normalizeModel(s); n != "" {
				return n
			}
		}
	}
	return ""
}

func filterModelsByAllowlist(models []map[string]any, restricted map[string]struct{}, admin bool) []map[string]any {
	if admin {
		return models
	}
	out := make([]map[string]any, 0, len(models))
	for _, m := range models {
		name := modelName(m)
		if name == "" || isRestrictedName(name, restricted) {
			continue
		}
		out = append(out, m)
	}
	return out
}

func modelOnAllowlist(name string, live []map[string]any, restricted map[string]struct{}, admin bool) bool {
	want := normalizeModel(name)
	if want == "" {
		return false
	}
	for _, m := range live {
		got := normalizeModel(modelName(m))
		if got == "" || got != want {
			continue
		}
		if admin || !isRestrictedName(got, restricted) {
			return true
		}
	}
	return false
}

func writeLocalModelNotFound(w http.ResponseWriter) {
	writeOpenAIError(w, http.StatusNotFound, "model not found", "invalid_request_error", nil)
}

func auditRestricted(ctx context.Context, pool *pgxpool.Pool, ident authIdentity, model, action, path string, status int) {
	if pool == nil || model == "" {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var userID any
	var keyID any
	if ident.userID != "" {
		userID = ident.userID
	}
	if ident.keyID != "" {
		keyID = ident.keyID
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO restricted_access_audit (user_id, key_id, model_name, action, status_code, path)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, keyID, model, action, status, truncatePath(path)); err != nil {
		log.Printf("restricted audit insert failed")
	}
}

func truncatePath(p string) string {
	if len(p) > 512 {
		return p[:512]
	}
	return p
}

type gateResult struct {
	live       []map[string]any
	restricted map[string]struct{}
	failClosed bool
}

func loadGate(ctx context.Context, pool *pgxpool.Pool, ollaBase *url.URL, admin bool) gateResult {
	restricted, ok := restrictedStore.load(ctx, pool)
	if !ok {
		if admin {
			models, err := fetchLiveOllamaModelsRaw(ollaBase)
			if err != nil {
				return gateResult{failClosed: true}
			}
			return gateResult{live: models, restricted: map[string]struct{}{}}
		}
		return gateResult{failClosed: true}
	}
	models, err := fetchLiveOllamaModelsRaw(ollaBase)
	if err != nil {
		return gateResult{failClosed: true}
	}
	return gateResult{live: models, restricted: restricted}
}
