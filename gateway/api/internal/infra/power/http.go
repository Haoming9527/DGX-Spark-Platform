package power

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type snapshotReader interface {
	Read(context.Context) (Snapshot, error)
}

func Handler(reader snapshotReader, readKey string) http.Handler {
	expected := sha256.Sum256([]byte(readKey))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		auth := r.Header.Get("Authorization")
		actual := sha256.Sum256([]byte(strings.TrimPrefix(auth, "Bearer ")))
		if readKey == "" || !strings.HasPrefix(auth, "Bearer ") || subtle.ConstantTimeCompare(actual[:], expected[:]) != 1 {
			w.Header().Set("WWW-Authenticate", "Bearer")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized"})
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(http.StatusMethodNotAllowed)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Read-only endpoint"})
			return
		}
		if r.Method == http.MethodHead {
			return
		}
		reading, err := reader.Read(r.Context())
		if err != nil {
			status := http.StatusServiceUnavailable
			message := "Could not connect to the power meter."
			if errors.Is(err, context.DeadlineExceeded) {
				status = http.StatusGatewayTimeout
				message = "The power meter did not respond in time."
			}
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
			return
		}
		_ = json.NewEncoder(w).Encode(reading)
	})
}
