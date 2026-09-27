package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	capCacheTTL      = 2 * time.Minute
	capCacheFailTTL  = 20 * time.Second
	capFetchTimeout  = 6 * time.Second
	capFetchParallel = 6
)

type capCacheEntry struct {
	caps []string
	at   time.Time
	ok   bool
}

var capCache sync.Map

type ollamaTagsResponse struct {
	Models []map[string]any `json:"models"`
}

func liveModelListKind(r *http.Request) (string, bool) {
	if r.Method != http.MethodGet {
		return "", false
	}
	switch strings.TrimSuffix(r.URL.Path, "/") {
	case "/olla/ollama/api/tags":
		return "ollama", true
	case "/v1/models", "/olla/ollama/v1/models", "/olla/proxy/v1/models":
		return "openai", true
	default:
		return "", false
	}
}

func writeLiveModelList(w http.ResponseWriter, ollaBase *url.URL, kind string, restricted map[string]struct{}, admin bool) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	models, err := fetchLiveOllamaModelsRaw(ollaBase)
	if err != nil {
		log.Printf("live model list: %v", err)
		writeOpenAIError(w, http.StatusBadGateway, "Failed to list models from AI servers.", "server_error", nil)
		return
	}
	models = filterModelsByAllowlist(models, restricted, admin)
	endpoints, _ := listHealthyOllamaEndpoints(ollaBase)
	models = attachCapabilities(models, endpoints)
	if kind == "openai" {
		data := make([]map[string]any, 0, len(models))
		for _, m := range models {
			id := modelName(m)
			if id == "" {
				continue
			}
			item := map[string]any{
				"id":       id,
				"object":   "model",
				"owned_by": "ollama",
			}
			if caps := capabilitiesFromModel(m); len(caps) > 0 {
				item["capabilities"] = caps
			}
			data = append(data, item)
		}
		writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": data})
		return
	}
	writeJSON(w, http.StatusOK, ollamaTagsResponse{Models: models})
}

func fetchLiveOllamaModelsRaw(ollaBase *url.URL) ([]map[string]any, error) {
	endpoints, err := listHealthyOllamaEndpoints(ollaBase)
	if err != nil {
		return nil, err
	}
	if len(endpoints) == 0 {
		models, err := fetchOllaTags(ollaBase)
		if err != nil {
			return nil, err
		}
		return models, nil
	}

	type result struct {
		models []map[string]any
		err    error
	}
	ch := make(chan result, len(endpoints))
	var wg sync.WaitGroup
	for _, ep := range endpoints {
		wg.Add(1)
		go func(ep ollaEndpoint) {
			defer wg.Done()
			models, err := fetchEndpointTags(ep)
			ch <- result{models: models, err: err}
		}(ep)
	}
	wg.Wait()
	close(ch)

	merged := make(map[string]map[string]any)
	var fetchErr error
	ok := 0
	for r := range ch {
		if r.err != nil {
			fetchErr = r.err
			continue
		}
		ok++
		for _, m := range r.models {
			name := modelName(m)
			if name == "" {
				continue
			}
			if _, exists := merged[name]; !exists {
				merged[name] = m
			}
		}
	}
	if ok == 0 {
		if catalog, fallbackErr := fetchOllaTags(ollaBase); fallbackErr == nil && len(catalog) > 0 {
			return catalog, nil
		}
		if fetchErr != nil {
			return nil, fetchErr
		}
		return []map[string]any{}, nil
	}

	names := make([]string, 0, len(merged))
	for name := range merged {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]map[string]any, 0, len(names))
	for _, name := range names {
		out = append(out, merged[name])
	}
	return out, nil
}

func attachCapabilities(models []map[string]any, endpoints []ollaEndpoint) []map[string]any {
	ep, ok := firstShowEndpoint(endpoints)
	if !ok {
		return models
	}
	sem := make(chan struct{}, capFetchParallel)
	var wg sync.WaitGroup
	for i := range models {
		name := modelName(models[i])
		if name == "" {
			continue
		}
		wg.Add(1)
		go func(i int, name string, tagged []string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			models[i]["capabilities"] = lookupCapabilities(ep, name, tagged)
		}(i, name, capabilitiesFromModel(models[i]))
	}
	wg.Wait()
	return models
}

func firstShowEndpoint(endpoints []ollaEndpoint) (ollaEndpoint, bool) {
	for _, ep := range endpoints {
		if strings.TrimSpace(ep.URL) != "" {
			return ep, true
		}
	}
	if u := strings.TrimSpace(os.Getenv("SG_API_ENDPOINT")); u != "" {
		return ollaEndpoint{Name: "spark", URL: u}, true
	}
	return ollaEndpoint{}, false
}

func lookupCapabilities(ep ollaEndpoint, name string, tagged []string) []string {
	if v, ok := capCache.Load(name); ok {
		entry := v.(capCacheEntry)
		ttl := capCacheTTL
		if !entry.ok {
			ttl = capCacheFailTTL
		}
		if time.Since(entry.at) < ttl {
			if entry.caps == nil {
				return []string{}
			}
			return entry.caps
		}
	}
	caps, err := fetchShowCapabilities(ep, name)
	if err != nil {
		if len(tagged) > 0 {
			capCache.Store(name, capCacheEntry{caps: tagged, at: time.Now(), ok: true})
			return tagged
		}
		log.Printf("show %s: %v", name, err)
		capCache.Store(name, capCacheEntry{caps: []string{}, at: time.Now(), ok: false})
		return []string{}
	}
	if caps == nil {
		caps = []string{}
	}
	capCache.Store(name, capCacheEntry{caps: caps, at: time.Now(), ok: true})
	return caps
}

func capabilitiesFromModel(m map[string]any) []string {
	raw, ok := m["capabilities"]
	if !ok || raw == nil {
		return nil
	}
	switch v := raw.(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				if s = strings.TrimSpace(s); s != "" {
					out = append(out, s)
				}
			}
		}
		if len(out) == 0 {
			return nil
		}
		return out
	default:
		return nil
	}
}

func fetchShowCapabilities(ep ollaEndpoint, name string) ([]string, error) {
	base, err := url.Parse(ep.URL)
	if err != nil {
		return nil, err
	}
	body, err := json.Marshal(map[string]string{"model": name, "name": name})
	if err != nil {
		return nil, err
	}
	reqURL := base.ResolveReference(&url.URL{Path: "/api/show"})
	req, err := http.NewRequest(http.MethodPost, reqURL.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := strings.TrimSpace(os.Getenv("SG_API_KEY")); key != "" {
		req.Header.Set("X-API-Key", key)
	}
	client := &http.Client{Timeout: capFetchTimeout}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", ep.Name, err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", ep.Name, err)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: show status %d", ep.Name, res.StatusCode)
	}
	var payload struct {
		Capabilities []string `json:"capabilities"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("%s: %w", ep.Name, err)
	}
	return payload.Capabilities, nil
}

func listHealthyOllamaEndpoints(ollaBase *url.URL) ([]ollaEndpoint, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	reqURL := ollaBase.ResolveReference(&url.URL{Path: "/internal/status/endpoints"})
	res, err := client.Get(reqURL.String())
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("olla endpoints status %d", res.StatusCode)
	}
	var payload ollaEndpointsPayload
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	out := make([]ollaEndpoint, 0, len(payload.Endpoints))
	for _, ep := range payload.Endpoints {
		if !strings.EqualFold(ep.Status, "healthy") {
			continue
		}
		if ep.Type != "" && !strings.EqualFold(ep.Type, "ollama") {
			continue
		}
		if strings.TrimSpace(ep.URL) == "" {
			ep.URL = strings.TrimSpace(os.Getenv("SG_API_ENDPOINT"))
		}
		if ep.URL == "" {
			continue
		}
		out = append(out, ep)
	}
	return out, nil
}

func fetchOllaTags(ollaBase *url.URL) ([]map[string]any, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	reqURL := ollaBase.ResolveReference(&url.URL{Path: "/olla/ollama/api/tags"})
	res, err := client.Get(reqURL.String())
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("olla tags status %d", res.StatusCode)
	}
	var payload ollamaTagsResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.Models == nil {
		return []map[string]any{}, nil
	}
	return payload.Models, nil
}

func fetchEndpointTags(ep ollaEndpoint) ([]map[string]any, error) {
	base, err := url.Parse(ep.URL)
	if err != nil {
		return nil, err
	}
	reqURL := base.ResolveReference(&url.URL{Path: "/api/tags"})
	req, err := http.NewRequest(http.MethodGet, reqURL.String(), nil)
	if err != nil {
		return nil, err
	}
	if key := strings.TrimSpace(os.Getenv("SG_API_KEY")); key != "" {
		req.Header.Set("X-API-Key", key)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", ep.Name, err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", ep.Name, err)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: tags status %d", ep.Name, res.StatusCode)
	}
	var payload ollamaTagsResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("%s: %w", ep.Name, err)
	}
	if payload.Models == nil {
		return []map[string]any{}, nil
	}
	return payload.Models, nil
}

func modelName(m map[string]any) string {
	for _, key := range []string{"name", "model", "id"} {
		if s, ok := m[key].(string); ok {
			if name := strings.TrimSpace(s); name != "" {
				return name
			}
		}
	}
	return ""
}
