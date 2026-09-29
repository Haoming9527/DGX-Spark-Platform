package ai

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const maxRequestBytes = 48 << 20

func inferencePath(path string) bool {
	switch path {
	case "/v1/chat/completions", "/v1/completions", "/v1/embeddings",
		"/olla/proxy/v1/chat/completions", "/olla/proxy/v1/completions", "/olla/proxy/v1/embeddings",
		"/olla/ollama/v1/chat/completions", "/olla/ollama/v1/completions", "/olla/ollama/v1/embeddings",
		"/olla/ollama/api/chat", "/olla/ollama/api/generate", "/olla/ollama/api/embed", "/olla/ollama/api/embeddings":
		return true
	default:
		return false
	}
}

func readRequestModel(w http.ResponseWriter, r *http.Request) (string, error) {
	if r.Body == nil {
		return "", errors.New("A JSON request body is required.")
	}
	if encoding := r.Header.Get("Content-Encoding"); encoding != "" && encoding != "identity" {
		return "", errors.New("Compressed request bodies are not supported.")
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(30 * time.Second))
	defer http.NewResponseController(w).SetReadDeadline(time.Time{})
	raw, err := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return "", err
		}
		return "", errors.New("Could not read the request body.")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	start, err := decoder.Token()
	if err != nil || start != json.Delim('{') {
		return "", errors.New("The request body must be a JSON object.")
	}
	payload := make(map[string]json.RawMessage)
	for decoder.More() {
		token, err := decoder.Token()
		key, ok := token.(string)
		if err != nil || !ok {
			return "", errors.New("Invalid JSON request body.")
		}
		if (strings.EqualFold(key, "model") && key != "model") || (strings.EqualFold(key, "name") && key != "name") {
			return "", errors.New("Use the exact model or name field spelling.")
		}
		if _, exists := payload[key]; exists {
			return "", errors.New("Duplicate JSON fields are not allowed.")
		}
		var value json.RawMessage
		if decoder.Decode(&value) != nil {
			return "", errors.New("Invalid JSON request body.")
		}
		payload[key] = value
	}
	if end, err := decoder.Token(); err != nil || end != json.Delim('}') || decoder.Decode(new(any)) != io.EOF {
		return "", errors.New("Invalid JSON request body.")
	}
	model := ""
	for _, field := range []string{"model", "name"} {
		if value, ok := payload[field]; ok {
			var name string
			if json.Unmarshal(value, &name) != nil || strings.TrimSpace(name) == "" {
				return "", errors.New("The model must be a non-empty string.")
			}
			name = strings.TrimSpace(name)
			if model != "" && normalizeModel(name) != normalizeModel(model) {
				return "", errors.New("Conflicting model identifiers are not allowed.")
			}
			if model == "" {
				model = name
			}
		}
	}
	if model == "" {
		return "", errors.New("A model is required in the JSON body.")
	}
	query := r.URL.Query()
	for key := range query {
		if (strings.EqualFold(key, "model") && key != "model") || (strings.EqualFold(key, "name") && key != "name") {
			return "", errors.New("Use the exact model or name query parameter spelling.")
		}
	}
	for _, field := range []string{"model", "name"} {
		if values, ok := query[field]; ok {
			if len(values) != 1 || normalizeModel(values[0]) != normalizeModel(model) {
				return "", errors.New("Conflicting model identifiers are not allowed.")
			}
			query.Del(field)
		}
	}
	// Forward exactly the model that was authorized, without ambiguous aliases.
	payload["model"], _ = json.Marshal(model)
	if strings.Contains(r.URL.Path, "/v1/") && (strings.HasSuffix(r.URL.Path, "/chat/completions") || strings.HasSuffix(r.URL.Path, "/completions")) && string(payload["stream"]) == "true" {
		options := map[string]json.RawMessage{}
		if rawOptions, ok := payload["stream_options"]; ok && string(rawOptions) != "null" {
			if json.Unmarshal(rawOptions, &options) != nil {
				return "", errors.New("Invalid stream_options.")
			}
		}
		options["include_usage"] = json.RawMessage("true")
		payload["stream_options"], _ = json.Marshal(options)
	}
	if _, ok := payload["name"]; ok {
		payload["name"] = payload["model"]
	}
	raw, err = json.Marshal(payload)
	if err != nil {
		return "", errors.New("Invalid JSON request body.")
	}
	r.URL.RawQuery = query.Encode()
	r.Body = io.NopCloser(bytes.NewReader(raw))
	r.ContentLength = int64(len(raw))
	r.Header.Set("Content-Length", strconv.Itoa(len(raw)))
	r.Header.Set("Content-Type", "application/json")
	return normalizeModel(model), nil
}
