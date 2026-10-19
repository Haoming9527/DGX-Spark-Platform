package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"maps"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	modelCatalogTTL     = 30 * time.Second
	modelCatalogTimeout = 3 * time.Second
	modelCatalogMax     = 40
)

type modelCatalogEntry struct {
	text string
	at   time.Time
}

var modelCatalogs = struct {
	sync.Mutex
	entries map[bool]modelCatalogEntry
}{entries: map[bool]modelCatalogEntry{}}


func selectPromptSections(raw, conversation string) string {
	var out []string
	include := true
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "<!-- when:") && strings.HasSuffix(trimmed, "-->"):
			include = false
			list := strings.TrimSuffix(strings.TrimPrefix(trimmed, "<!-- when:"), "-->")
			for _, keyword := range strings.Split(list, ",") {
				if keyword = strings.ToLower(strings.TrimSpace(keyword)); keyword != "" && strings.Contains(conversation, keyword) {
					include = true
					break
				}
			}
		case trimmed == "<!-- end -->":
			include = true
		case include:
			out = append(out, line)
		}
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

func conversationText(msgs []any) string {
	var b strings.Builder
	for _, raw := range msgs {
		m, ok := raw.(map[string]any)
		if !ok || str(m["role"]) != "user" {
			continue
		}
		switch content := m["content"].(type) {
		case string:
			b.WriteString(content)
		case []any:
			for _, part := range content {
				if p, ok := part.(map[string]any); ok {
					b.WriteString(str(p["text"]))
				}
			}
		}
		b.WriteByte('\n')
		if b.Len() > 64<<10 {
			break
		}
	}
	return strings.ToLower(b.String())
}

func renderSystemPrompt(r *http.Request, prompt string, ollaURL *url.URL, gate gateResult, admin bool, msgs []any) string {
	prompt = selectPromptSections(prompt, conversationText(msgs))
	if prompt == "" {
		return ""
	}
	if strings.Contains(prompt, "{{API_URL}}") {
		prompt = strings.ReplaceAll(prompt, "{{API_URL}}", publicAPIURL(r))
	}
	if strings.Contains(prompt, "{{MODELS}}") {
		prompt = strings.ReplaceAll(prompt, "{{MODELS}}", modelCatalog(r.Context(), ollaURL, gate, admin))
	}
	return prompt
}

func publicAPIURL(r *http.Request) string {
	if configured := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_API_URL")), "/"); configured != "" {
		return configured
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func modelCatalog(ctx context.Context, ollaURL *url.URL, gate gateResult, admin bool) string {
	modelCatalogs.Lock()
	entry, ok := modelCatalogs.entries[admin]
	modelCatalogs.Unlock()
	if ok && time.Since(entry.at) < modelCatalogTTL {
		return entry.text
	}
	models := make([]map[string]any, len(gate.live))
	for i, m := range gate.live {
		models[i] = maps.Clone(m)
	}
	models = filterModelsByAllowlist(models, gate.restricted, admin)
	endpoints, _ := listHealthyOllamaEndpoints(ollaURL)
	lookupCtx, cancel := context.WithTimeout(ctx, modelCatalogTimeout)
	defer cancel()
	models = attachCapabilities(lookupCtx, models, endpoints)
	text := formatModelCatalog(models)
	if lookupCtx.Err() == nil {
		modelCatalogs.Lock()
		modelCatalogs.entries[admin] = modelCatalogEntry{text: text, at: time.Now()}
		modelCatalogs.Unlock()
	}
	return text
}

func formatModelCatalog(models []map[string]any) string {
	if len(models) == 0 {
		return "- None online right now; the inference server may be asleep or offline."
	}
	var b strings.Builder
	for i, m := range models {
		if i == modelCatalogMax {
			fmt.Fprintf(&b, "- …and %d more (see `GET /v1/models`)\n", len(models)-modelCatalogMax)
			break
		}
		name := modelName(m)
		if name == "" {
			continue
		}
		b.WriteString("- `" + name + "`")
		if details, ok := m["details"].(map[string]any); ok {
			if size, ok := details["parameter_size"].(string); ok && strings.TrimSpace(size) != "" {
				b.WriteString(" (" + strings.TrimSpace(size) + ")")
			}
		}
		if labels := capabilityLabels(capabilitiesFromModel(m)); labels != "" {
			b.WriteString(": " + labels)
		}
		b.WriteByte('\n')
	}
	return strings.TrimRight(b.String(), "\n")
}

func capabilityLabels(caps []string) string {
	has := make(map[string]bool, len(caps))
	for _, c := range caps {
		has[strings.ToLower(strings.TrimSpace(c))] = true
	}
	switch {
	case has["decision"]:
		return "System One decisions only (`POST /v1/systemone`)"
	case has["embedding"] && !has["completion"]:
		return "embeddings only (`POST /v1/embeddings`)"
	}
	var labels []string
	for _, c := range []struct{ key, label string }{
		{"completion", "chat"}, {"vision", "image input"}, {"tools", "tool calling"},
		{"thinking", "thinking"}, {"insert", "code fill-in"}, {"embedding", "embeddings"},
	} {
		if has[c.key] {
			labels = append(labels, c.label)
		}
	}
	return strings.Join(labels, ", ")
}

type systemPromptStore struct {
	mu   sync.Mutex
	path string
	text string
	mod  time.Time
}

func loadSystemPromptStore(path string) *systemPromptStore {
	if path == "" {
		return nil
	}
	s := &systemPromptStore{path: path}
	if text, err := s.reload(); err != nil {
		log.Printf("system prompt: %v (inject disabled until file is readable)", err)
	} else if text != "" {
		log.Printf("system prompt loaded from %s (%d bytes)", path, len(text))
	} else {
		log.Printf("system prompt file %s is empty — inject skipped", path)
	}
	return s
}

func (s *systemPromptStore) get() string {
	if s == nil || s.path == "" {
		return ""
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.reload(); err != nil {
		return s.text
	}
	return s.text
}

func (s *systemPromptStore) reload() (string, error) {
	info, err := os.Stat(s.path)
	if err != nil {
		return s.text, err
	}
	if !s.mod.IsZero() && !info.ModTime().After(s.mod) {
		return s.text, nil
	}
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return s.text, err
	}
	s.text = parseSystemPromptMarkdown(string(raw))
	s.mod = info.ModTime()
	return s.text, nil
}

func parseSystemPromptMarkdown(raw string) string {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	if i := strings.Index(raw, "\n---\n"); i >= 0 {
		return strings.TrimSpace(raw[i+5:])
	}
	if strings.HasPrefix(raw, "---\n") {
		return strings.TrimSpace(raw[4:])
	}
	return strings.TrimSpace(raw)
}

func shouldInjectSystemPrompt(r *http.Request) bool {
	if r.Method != http.MethodPost {
		return false
	}
	path := r.URL.Path
	return path == "/v1/chat/completions" ||
		strings.HasSuffix(path, "/chat/completions") ||
		path == "/olla/ollama/api/chat" ||
		strings.HasSuffix(path, "/api/chat")
}

func structuredResponse(value any) bool {
	switch v := value.(type) {
	case string:
		typ := strings.ToLower(strings.TrimSpace(v))
		return typ == "json" || typ == "json_object"
	case map[string]any:
		typ := strings.ToLower(strings.TrimSpace(str(v["type"])))
		return typ == "json" || typ == "json_object" || typ == "json_schema"
	default:
		return false
	}
}

func injectSystemPrompt(r *http.Request, render func(msgs []any) string) error {
	if render == nil || r.Body == nil {
		return nil
	}
	body, err := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if err != nil {
		return err
	}
	keep := func() {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		keep()
		return nil
	}

	msgs, ok := payload["messages"].([]any)
	if !ok {
		keep()
		return nil
	}

	if format, ok := payload["format"]; ok && format != nil {
		keep()
		return nil
	}
	if structuredResponse(payload["response_format"]) {
		keep()
		return nil
	}

	prompt := render(msgs)
	if prompt == "" {
		keep()
		return nil
	}

	if len(msgs) > 0 {
		if m, ok := msgs[0].(map[string]any); ok {
			role, _ := m["role"].(string)
			content, _ := m["content"].(string)
			if role == "system" && strings.TrimSpace(content) == prompt {
				keep()
				return nil
			}
		}
	}

	injected := make([]any, 0, len(msgs)+1)
	injected = append(injected, map[string]any{
		"role":    "system",
		"content": prompt,
	})
	injected = append(injected, msgs...)
	payload["messages"] = injected

	out, err := json.Marshal(payload)
	if err != nil {
		keep()
		return err
	}
	r.Body = io.NopCloser(bytes.NewReader(out))
	r.ContentLength = int64(len(out))
	r.Header.Set("Content-Length", strconv.Itoa(len(out)))
	return nil
}
