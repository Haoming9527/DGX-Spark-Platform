package ai

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSystemOneUsageCapture(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
		want tokenUsage
	}{
		{"decision tokens", `{"answers":{},"usage":{"input_tokens":31,"output_tokens":4}}`, tokenUsage{31, 4, 35}},
		{"zero output is valid", `{"answers":{},"usage":{"input_tokens":31,"output_tokens":0}}`, tokenUsage{31, 0, 31}},
		{"empty input is valid", `{"answers":{},"usage":{"input_tokens":0,"output_tokens":2}}`, tokenUsage{0, 2, 2}},
		{"negative input ignored", `{"usage":{"input_tokens":-1,"output_tokens":5}}`, tokenUsage{}},
		{"negative output ignored", `{"usage":{"input_tokens":5,"output_tokens":-1}}`, tokenUsage{}},
		{"overflow ignored", `{"usage":{"input_tokens":9223372036854775807,"output_tokens":1}}`, tokenUsage{}},
		{"OpenAI usage unchanged", `{"usage":{"prompt_tokens":20,"completion_tokens":5,"total_tokens":25}}`, tokenUsage{20, 5, 25}},
		{"native Ollama usage unchanged", `{"prompt_eval_count":20,"eval_count":5}`, tokenUsage{20, 5, 25}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			u := &usageCapture{}
			mid := len(tc.body) / 2
			u.write([]byte(tc.body[:mid]), "application/json")
			u.write([]byte(tc.body[mid:]), "application/json")
			u.finish()
			if u.tokens != tc.want {
				t.Fatalf("usage = %+v; want %+v", u.tokens, tc.want)
			}
		})
	}
}

func TestSystemOneFailedResponseDoesNotCountTokens(t *testing.T) {
	u := &usageCapture{}
	w := &statusRecorder{ResponseWriter: httptest.NewRecorder(), status: http.StatusOK, usage: u}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_, _ = w.Write([]byte(`{"error":"invalid questions","usage":{"input_tokens":100,"output_tokens":1}}`))
	u.finish()
	if u.tokens != (tokenUsage{}) {
		t.Fatalf("failed request counted usage: %+v", u.tokens)
	}
}
