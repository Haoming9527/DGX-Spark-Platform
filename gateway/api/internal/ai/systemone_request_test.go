package ai

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const systemOneTestImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZYsAAAAASUVORK5CYII="

func TestDecisionModelUsesCapabilitiesBeforeNameFallback(t *testing.T) {
	for _, tc := range []struct {
		name string
		caps []string
		want bool
	}{
		{"clef", nil, true},
		{"clef-flash:latest", nil, true},
		{"library/clef:8b", nil, true},
		{"clef-chat", nil, false},
		{"my-clef", nil, false},
		{"custom-decision", []string{"vision", "decision"}, true},
		{"custom-decision", []string{" Decision "}, true},
		{"clef", []string{"completion"}, false},
		{"clef-flash", []string{"vision"}, false},
	} {
		t.Run(tc.name+strings.Join(tc.caps, ","), func(t *testing.T) {
			if got := decisionModel(tc.name, tc.caps); got != tc.want {
				t.Fatalf("decisionModel(%q, %v) = %v; want %v", tc.name, tc.caps, got, tc.want)
			}
		})
	}
}

func TestSystemOneRequestPreservesDecisionInput(t *testing.T) {
	const questions = `{"z_last":{"type":"choice","instructions":{"z":"Keep this order","a":true},"criteria":{"z":"Last","a":"First"}},"a_first":{"type":"score","criteria":["Low","High"]}}`
	const state = `{"z":42,"a":["first",{"nested":true}]}`
	body := `{"model":"clef:latest","state":` + state + `,"questions":` + questions + `,"keep_alive":"10m","images":["` + systemOneTestImage + `"]}`
	r := httptest.NewRequest(http.MethodPost, "/v1/systemone?model=clef&trace=1", strings.NewReader(body))
	model, err := readRequestModel(httptest.NewRecorder(), r)
	if err != nil {
		t.Fatal(err)
	}
	if model != "clef" || r.URL.RawQuery != "trace=1" {
		t.Fatalf("unexpected authorized model/query: %q / %q", model, r.URL.RawQuery)
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if string(got["questions"]) != questions || string(got["state"]) != state {
		t.Fatalf("decision input or order changed: %s", raw)
	}
	if string(got["keep_alive"]) != `"10m"` || string(got["model"]) != `"clef:latest"` || len(got) != 5 {
		t.Fatalf("unexpected decision fields: %s", raw)
	}
	if r.ContentLength != int64(len(raw)) {
		t.Fatalf("ContentLength = %d; want %d", r.ContentLength, len(raw))
	}
}

func TestSystemOneRequestLimits(t *testing.T) {
	for _, tc := range []struct {
		name   string
		images string
		size   int
		limit  int64
	}{
		{"text boundary", "", 64 << 10, 0},
		{"text over limit", "", (64 << 10) + 1, 64 << 10},
		{"empty images use text limit", `,"images":[]`, (64 << 10) + 1, 64 << 10},
		{"null images use text limit", `,"images":null`, (64 << 10) + 1, 64 << 10},
		{"image allows larger state", `,"images":["` + systemOneTestImage + `"]`, 65 << 10, 0},
		{"image boundary", `,"images":["` + systemOneTestImage + `"]`, 32 << 20, 0},
		{"image over limit", `,"images":["` + systemOneTestImage + `"]`, (32 << 20) + 1, 32 << 20},
	} {
		t.Run(tc.name, func(t *testing.T) {
			prefix := `{"model":"clef","questions":{"ok":{"type":"noul","instructions":"Relevant?"}},"state":"`
			suffix := `"` + tc.images + `}`
			body := io.MultiReader(strings.NewReader(prefix), bytes.NewReader(bytes.Repeat([]byte("x"), tc.size-len(prefix)-len(suffix))), strings.NewReader(suffix))
			r := httptest.NewRequest(http.MethodPost, "/v1/systemone", body)
			_, err := readRequestModel(httptest.NewRecorder(), r)
			if tc.limit == 0 {
				if err != nil {
					t.Fatalf("valid boundary rejected: %v", err)
				}
				return
			}
			var tooLarge *http.MaxBytesError
			if !errors.As(err, &tooLarge) || tooLarge.Limit != tc.limit {
				t.Fatalf("error = %v; want MaxBytesError with limit %d", err, tc.limit)
			}
		})
	}
}

func TestSystemOneRejectsAmbiguousModels(t *testing.T) {
	for _, tc := range []struct {
		name string
		path string
		body string
	}{
		{"name only", "/v1/systemone", `{"name":"clef","state":"x","questions":{}}`},
		{"duplicate model", "/v1/systemone", `{"model":"clef","model":"clef-flash","state":"x","questions":{}}`},
		{"conflicting name", "/v1/systemone", `{"model":"clef","name":"clef-flash","state":"x","questions":{}}`},
		{"conflicting query", "/v1/systemone?model=clef-flash", `{"model":"clef","state":"x","questions":{}}`},
		{"mixed case model", "/v1/systemone", `{"Model":"clef","state":"x","questions":{}}`},
		{"trailing JSON", "/v1/systemone", `{"model":"clef","state":"x","questions":{}} {}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
			if _, err := readRequestModel(httptest.NewRecorder(), r); err == nil {
				t.Fatal("ambiguous System One model was accepted")
			}
		})
	}
}
