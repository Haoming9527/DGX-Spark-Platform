package ai

import (
	"context"
	"net/url"
	"strings"
)

const (
	maxSystemOneTextBytes  = 64 << 10
	maxSystemOneImageBytes = 32 << 20
)

func systemOnePath(path string) bool {
	return path == "/v1/systemone" || path == "/olla/ollama/v1/systemone"
}

func textGenerationPath(path string) bool {
	return strings.HasSuffix(path, "/completions") ||
		path == "/olla/ollama/api/chat" || path == "/olla/ollama/api/generate"
}

func requestLimitMessage(limit int64) string {
	switch limit {
	case maxSystemOneTextBytes:
		return "System One request body exceeds 64 KiB without images."
	case maxSystemOneImageBytes:
		return "System One request body exceeds 32 MiB including images."
	default:
		return "Request body exceeds 48 MiB."
	}
}

func decisionModel(name string, caps []string) bool {
	for _, capability := range caps {
		if strings.EqualFold(strings.TrimSpace(capability), "decision") {
			return true
		}
	}
	if len(caps) != 0 {
		return false
	}
	name = strings.ToLower(strings.TrimSpace(name))
	name = name[strings.LastIndex(name, "/")+1:]
	name, _, _ = strings.Cut(name, ":")
	return name == "clef" || name == "clef-flash"
}

func decisionModelForRequest(ctx context.Context, ollaBase *url.URL, name string, models []map[string]any) bool {
	for _, model := range models {
		if normalizeModel(modelName(model)) != normalizeModel(name) {
			continue
		}
		tagged := capabilitiesFromModel(model)
		if len(tagged) > 0 {
			return decisionModel(name, tagged)
		}
		endpoints, _ := listHealthyOllamaEndpoints(ollaBase)
		entry := modelCapabilities(ctx, name, tagged, endpoints)
		return decisionModel(name, entry.caps)
	}
	return false
}
