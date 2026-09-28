package spark

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"
)

func authorized(r *http.Request, key string) bool {
	value := r.Header.Get("Authorization")
	actual, expected := sha256.Sum256([]byte(strings.TrimPrefix(value, "Bearer "))), sha256.Sum256([]byte(key))
	return key != "" && strings.HasPrefix(value, "Bearer ") && subtle.ConstantTimeCompare(actual[:], expected[:]) == 1
}
func jsonResponse(w http.ResponseWriter, status int, body any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func failure(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}

func (c *Controller) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/infra/dgx-spark" {
			if !authorized(r, c.config.ReadKey) {
				w.Header().Set("WWW-Authenticate", "Bearer")
				failure(w, 401, "Unauthorized")
				return
			}
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				w.Header().Set("Allow", "GET, HEAD")
				failure(w, 405, "Method not allowed")
				return
			}
			if r.Method == http.MethodHead {
				return
			}
			jsonResponse(w, 200, c.Read(r.Context()))
			return
		}
		if r.URL.Path != "/infra/dgx-spark/actions" {
			failure(w, 404, "Not found")
			return
		}
		if !authorized(r, c.config.ControlKey) {
			w.Header().Set("WWW-Authenticate", "Bearer")
			failure(w, 401, "Unauthorized")
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			failure(w, 405, "Method not allowed")
			return
		}
		actor := r.Header.Get("X-Actor-ID")
		if !uuidPattern.MatchString(actor) {
			failure(w, 400, "A valid requesting account is required.")
			return
		}
		kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || kind != "application/json" {
			failure(w, 415, "JSON is required.")
			return
		}
		_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(5 * time.Second))
		defer http.NewResponseController(w).SetReadDeadline(time.Time{})
		r.Body = http.MaxBytesReader(w, r.Body, 2048)
		defer r.Body.Close()
		var body struct {
			Action    string `json:"action"`
			RequestID string `json:"request_id"`
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if decoder.Decode(&body) != nil || decoder.Decode(&struct{}{}) != io.EOF || (body.Action != "on" && body.Action != "shutdown") || !uuidPattern.MatchString(body.RequestID) {
			failure(w, 400, "Expected an on or shutdown action and a UUID request_id.")
			return
		}
		op, status, code, message := c.Start(body.Action, body.RequestID, actor)
		if message != "" {
			jsonResponse(w, status, map[string]string{"error": message, "code": code})
			return
		}
		jsonResponse(w, status, op)
	})
}
