package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/admission"
)

const systemOneTestBody = `{"model":"clef","state":{"ticket":"Refund requested"},"questions":{"route":{"type":"choice","instructions":"Pick a department","criteria":{"billing":"Money","support":"Technical issues"}}},"keep_alive":"5m"}`

func newSystemOneTestServer(t *testing.T, gate *admission.Gate, inference http.HandlerFunc) (*Server, *atomic.Int64) {
	t.Helper()
	t.Setenv("SG_API_ENDPOINT", "")
	t.Setenv("SG_API_KEY", "")
	capCache.Range(func(key, _ any) bool { capCache.Delete(key); return true })
	var calls atomic.Int64
	var upstream *httptest.Server
	upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/internal/status/endpoints":
			_ = json.NewEncoder(w).Encode(ollaEndpointsPayload{Endpoints: []ollaEndpoint{{Name: "test", URL: upstream.URL, Type: "ollama", Status: "healthy"}}, TotalCount: 1, HealthyCount: 1, RoutableCount: 1})
		case "/api/tags", "/olla/ollama/api/tags":
			_, _ = io.WriteString(w, `{"models":[{"name":"clef:latest"},{"name":"clef-flash:latest"},{"name":"decision-alias:latest"},{"name":"clef-chat:latest"},{"name":"normal:latest"}]}`)
		case "/api/show":
			var body struct {
				Model string `json:"model"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			model := normalizeModel(body.Model)
			if model == "clef" || model == "clef-flash" || model == "decision-alias" {
				_, _ = io.WriteString(w, `{"capabilities":["decision","vision"]}`)
			} else {
				_, _ = io.WriteString(w, `{"capabilities":["completion"]}`)
			}
		default:
			calls.Add(1)
			if inference != nil {
				inference(w, r)
			} else {
				_, _ = io.WriteString(w, `{"model":"clef","answers":{},"usage":{"input_tokens":10,"output_tokens":0}}`)
			}
		}
	}))
	t.Cleanup(upstream.Close)
	s, err := New(context.Background(), Config{OllaURL: upstream.URL, AdminKey: "test-admin", ChatKey: "test-chat", Admission: gate})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s, &calls
}

func systemOneTestRequest(t *testing.T, s *Server, method, path, body, key string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if key != "" {
		r.Header.Set("Authorization", "Bearer "+key)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestSystemOneRoutesPreserveNativeRequestAndResponse(t *testing.T) {
	const response = `{"model":"clef","answers":{"route":{"choice":"billing","probabilities":{"billing":0.9,"support":0.1},"confidence":0.9}},"usage":{"input_tokens":31,"output_tokens":0}}`
	s, calls := newSystemOneTestServer(t, nil, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/olla/ollama/v1/systemone" || r.Method != http.MethodPost {
			t.Errorf("unexpected upstream route: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "" {
			t.Error("platform API key leaked to the upstream")
		}
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if len(body) != 4 || string(body["state"]) != `{"ticket":"Refund requested"}` || string(body["questions"]) != `{"route":{"type":"choice","instructions":"Pick a department","criteria":{"billing":"Money","support":"Technical issues"}}}` {
			t.Errorf("request altered by chat preparation: %v", body)
		}
		_, _ = io.WriteString(w, response)
	})
	for _, path := range []string{"/v1/systemone", "/olla/ollama/v1/systemone"} {
		w := systemOneTestRequest(t, s, http.MethodPost, path, systemOneTestBody, "test-admin")
		if w.Code != http.StatusOK || w.Body.String() != response {
			t.Fatalf("%s: status %d, body %s", path, w.Code, w.Body.String())
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("inference calls = %d; want 2", calls.Load())
	}
}

func TestSystemOnePreservesUpstreamValidationError(t *testing.T) {
	const response = `{"error":"questions.route.criteria must have at least 2 options"}`
	s, _ := newSystemOneTestServer(t, nil, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, response)
	})
	w := systemOneTestRequest(t, s, http.MethodPost, "/v1/systemone", systemOneTestBody, "test-admin")
	if w.Code != http.StatusBadRequest || w.Body.String() != response {
		t.Fatalf("upstream error changed: %d %s", w.Code, w.Body.String())
	}
}

func TestSystemOneUsesAuthenticationModelAccessAndAdmission(t *testing.T) {
	gate := admission.New()
	s, calls := newSystemOneTestServer(t, gate, nil)
	for _, tc := range []struct {
		name, method, key, body string
		status                  int
	}{
		{"missing key", http.MethodPost, "", systemOneTestBody, http.StatusUnauthorized},
		{"POST required", http.MethodGet, "test-admin", "", http.StatusMethodNotAllowed},
		{"model not installed", http.MethodPost, "test-admin", strings.Replace(systemOneTestBody, `"clef"`, `"missing"`, 1), http.StatusNotFound},
		{"permission service unavailable", http.MethodPost, "test-chat", systemOneTestBody, http.StatusServiceUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := systemOneTestRequest(t, s, tc.method, "/v1/systemone", tc.body, tc.key)
			if w.Code != tc.status {
				t.Fatalf("status = %d; want %d: %s", w.Code, tc.status, w.Body.String())
			}
		})
	}
	gate.Close("Shutdown in progress.")
	w := systemOneTestRequest(t, s, http.MethodPost, "/v1/systemone", systemOneTestBody, "test-admin")
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "Shutdown in progress.") {
		t.Fatalf("shutdown admission bypassed: %d %s", w.Code, w.Body.String())
	}
	if calls.Load() != 0 {
		t.Fatalf("rejected requests reached inference: %d", calls.Load())
	}
	live := []map[string]any{{"name": "clef:latest"}}
	restricted := map[string]struct{}{"clef": {}}
	if modelOnAllowlist("clef", live, restricted, false) || !modelOnAllowlist("clef", live, restricted, true) {
		t.Fatal("decision model bypassed existing role-based model restrictions")
	}
}

func TestDecisionModelsCannotUseChatOrGenerationAliases(t *testing.T) {
	s, calls := newSystemOneTestServer(t, nil, nil)
	for _, path := range []string{
		"/v1/chat/completions", "/v1/completions",
		"/olla/proxy/v1/chat/completions", "/olla/proxy/v1/completions",
		"/olla/ollama/v1/chat/completions", "/olla/ollama/v1/completions",
		"/olla/ollama/api/chat", "/olla/ollama/api/generate",
	} {
		for _, model := range []string{"clef", "clef-flash:latest", "decision-alias"} {
			t.Run(path+"/"+model, func(t *testing.T) {
				body := `{"model":"` + model + `","messages":[{"role":"user","content":"Hello"}],"prompt":"Hello"}`
				w := systemOneTestRequest(t, s, http.MethodPost, path, body, "test-admin")
				var payload struct {
					Error struct{ Code, Message string }
				}
				_ = json.Unmarshal(w.Body.Bytes(), &payload)
				if w.Code != http.StatusBadRequest || payload.Error.Code != "model_endpoint_mismatch" || !strings.Contains(payload.Error.Message, "/v1/systemone") {
					t.Fatalf("decision model accepted or unclear error: %d %s", w.Code, w.Body.String())
				}
			})
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("decision requests leaked into chat inference: %d", calls.Load())
	}
	for _, model := range []string{"normal", "clef-chat"} {
		w := systemOneTestRequest(t, s, http.MethodPost, "/v1/chat/completions", `{"model":"`+model+`","messages":[{"role":"user","content":"Hello"}]}`, "test-admin")
		if w.Code != http.StatusOK {
			t.Fatalf("ordinary chat model %q rejected: %d %s", model, w.Code, w.Body.String())
		}
	}
}

func TestDecisionModelsRemainInModelCatalog(t *testing.T) {
	s, _ := newSystemOneTestServer(t, nil, nil)
	w := systemOneTestRequest(t, s, http.MethodGet, "/v1/models", "", "test-admin")
	var response struct {
		Data []map[string]any `json:"data"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &response) != nil {
		t.Fatalf("invalid model catalog: %d %s", w.Code, w.Body.String())
	}
	decision := map[string]bool{}
	for _, model := range response.Data {
		for _, capability := range capabilitiesFromModel(model) {
			if capability == "decision" {
				decision[normalizeModel(modelName(model))] = true
			}
		}
	}
	if !decision["clef"] || !decision["clef-flash"] || !decision["decision-alias"] || decision["normal"] {
		t.Fatalf("wrong decision metadata in API model catalog: %s", w.Body.String())
	}
}

func TestDecisionModelRequestChecksShowBeforeClefFallback(t *testing.T) {
	t.Setenv("SG_API_ENDPOINT", "")
	t.Setenv("SG_API_KEY", "")
	for _, tc := range []struct {
		name   string
		status int
		body   string
		want   bool
	}{
		{"metadata overrides name", http.StatusOK, `{"capabilities":["completion"]}`, false},
		{"missing metadata uses fallback", http.StatusOK, `{}`, true},
		{"failed metadata uses fallback", http.StatusServiceUnavailable, `{"error":"unavailable"}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var upstream *httptest.Server
			upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/internal/status/endpoints" {
					_ = json.NewEncoder(w).Encode(ollaEndpointsPayload{Endpoints: []ollaEndpoint{{Name: "test", URL: upstream.URL, Type: "ollama", Status: "healthy"}}})
					return
				}
				if r.URL.Path != "/api/show" {
					t.Errorf("unexpected discovery request %s", r.URL.Path)
				}
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			}))
			defer upstream.Close()
			base, err := url.Parse(upstream.URL)
			if err != nil {
				t.Fatal(err)
			}
			got := decisionModelForRequest(context.Background(), base, "clef", []map[string]any{{"name": "clef:latest"}})
			if got != tc.want {
				t.Fatalf("decision classification = %v; want %v", got, tc.want)
			}
		})
	}
}

func TestSystemOneCancellationReleasesShutdownDrain(t *testing.T) {
	gate := admission.New()
	entered := make(chan struct{})
	cancelled := make(chan struct{})
	s, calls := newSystemOneTestServer(t, gate, func(_ http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		close(entered)
		<-r.Context().Done()
		close(cancelled)
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := httptest.NewRequest(http.MethodPost, "/v1/systemone", strings.NewReader(systemOneTestBody)).WithContext(ctx)
	r.Header.Set("Authorization", "Bearer test-admin")
	finished := make(chan struct{})
	go func() {
		s.ServeHTTP(httptest.NewRecorder(), r)
		close(finished)
	}()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("request never reached mock inference")
	}
	gate.Close("Shutting down")
	if active, _ := gate.Snapshot(); active != 1 {
		t.Fatalf("active decision inference = %d; want 1", active)
	}
	w := systemOneTestRequest(t, s, http.MethodPost, "/v1/systemone", systemOneTestBody, "test-admin")
	if w.Code != http.StatusServiceUnavailable || calls.Load() != 1 {
		t.Fatal("new inference admitted during shutdown")
	}
	cancel()
	for _, done := range []<-chan struct{}{cancelled, finished} {
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Fatal("cancellation did not terminate decision inference")
		}
	}
	if active, _ := gate.Snapshot(); active != 0 {
		t.Fatalf("cancelled decision request blocks shutdown drain: %d active", active)
	}
}
