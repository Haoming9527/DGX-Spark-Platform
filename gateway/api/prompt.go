package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

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

func injectSystemPrompt(r *http.Request, prompt string) error {
	if prompt == "" || r.Body == nil {
		return nil
	}
	body, err := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if err != nil {
		return err
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return nil
	}

	msgs, ok := payload["messages"].([]any)
	if !ok {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return nil
	}

	if len(msgs) > 0 {
		if m, ok := msgs[0].(map[string]any); ok {
			role, _ := m["role"].(string)
			content, _ := m["content"].(string)
			if role == "system" && strings.TrimSpace(content) == prompt {
				r.Body = io.NopCloser(bytes.NewReader(body))
				r.ContentLength = int64(len(body))
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
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return err
	}
	r.Body = io.NopCloser(bytes.NewReader(out))
	r.ContentLength = int64(len(out))
	r.Header.Set("Content-Length", strconv.Itoa(len(out)))
	return nil
}
