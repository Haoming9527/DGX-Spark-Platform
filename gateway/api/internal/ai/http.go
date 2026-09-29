package ai

import (
	"encoding/json"
	"net/http"
)

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	usage       *usageCapture
}

func (s *statusRecorder) WriteHeader(code int) {
	if !s.wroteHeader {
		s.status = code
		s.wroteHeader = true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if !s.wroteHeader {
		s.WriteHeader(http.StatusOK)
	}
	n, err := s.ResponseWriter.Write(b)
	if s.usage != nil && s.status >= 200 && s.status < 300 {
		s.usage.write(b[:n], s.Header().Get("Content-Type"))
	}
	return n, err
}

func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func writeOpenAIError(w http.ResponseWriter, status int, message, typ string, code *string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"message": message,
			"type":    typ,
			"code":    code,
		},
	})
}

func strPtr(s string) *string { return &s }
