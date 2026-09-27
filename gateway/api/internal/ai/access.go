package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

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

func loadRestricted(ctx context.Context, pool *pgxpool.Pool) (map[string]struct{}, bool) {
	if pool == nil {
		return nil, false
	}

	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	rows, err := pool.Query(ctx, `SELECT model_name FROM restricted_models`)
	if err != nil {
		return nil, false
	}
	defer rows.Close()

	next := make(map[string]struct{})
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, false
		}
		if n := normalizeModel(name); n != "" {
			next[n] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, false
	}
	return next, true
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

type gateResult struct {
	live                []map[string]any
	restricted          map[string]struct{}
	failClosed          bool
	databaseUnavailable bool
}

func loadGate(ctx context.Context, pool *pgxpool.Pool, ollaBase *url.URL, admin bool) gateResult {
	restricted, ok := loadRestricted(ctx, pool)
	if !ok {
		if admin {
			models, err := fetchLiveOllamaModelsRaw(ollaBase)
			if err != nil {
				return gateResult{failClosed: true}
			}
			return gateResult{live: models, restricted: map[string]struct{}{}}
		}
		return gateResult{failClosed: true, databaseUnavailable: true}
	}
	models, err := fetchLiveOllamaModelsRaw(ollaBase)
	if err != nil {
		return gateResult{failClosed: true}
	}
	return gateResult{live: models, restricted: restricted}
}
