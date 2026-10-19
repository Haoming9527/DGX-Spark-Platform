package ai

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type authIdentity struct {
	ok          bool
	keyID       string
	userID      string
	role        string
	unavailable bool
}

func authorize(ctx context.Context, pool *pgxpool.Pool, chatServiceKey, adminServiceKey string, r *http.Request) authIdentity {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return authIdentity{}
	}
	raw := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	if raw == "" {
		return authIdentity{}
	}

	rawB := []byte(raw)
	if chatServiceKey != "" && len(rawB) == len(chatServiceKey) &&
		subtle.ConstantTimeCompare(rawB, []byte(chatServiceKey)) == 1 {
		return authIdentity{ok: true, role: "user"}
	}
	if adminServiceKey != "" && len(rawB) == len(adminServiceKey) &&
		subtle.ConstantTimeCompare(rawB, []byte(adminServiceKey)) == 1 {
		return authIdentity{ok: true, role: "admin"}
	}

	if pool == nil {
		return authIdentity{unavailable: true}
	}

	sum := sha256.Sum256(rawB)
	hash := hex.EncodeToString(sum[:])

	var keyID, userID, role string
	var disabled bool
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	err := pool.QueryRow(ctx, `
		SELECT k.id, u.id, u.role, (u.disabled_at IS NOT NULL)
		FROM api_keys k
		JOIN users u ON u.id = k.user_id
		WHERE k.key_hash = $1
		LIMIT 1
	`, hash).Scan(&keyID, &userID, &role, &disabled)
	if err != nil {
		return authIdentity{unavailable: !errors.Is(err, pgx.ErrNoRows)}
	}
	if disabled {
		return authIdentity{}
	}
	if role != "admin" {
		role = "user"
	}
	return authIdentity{ok: true, keyID: keyID, userID: userID, role: role}
}

// clientIP trusts CF-Connecting-IP: Cloudflare overwrites it, and the API port is bound to localhost behind the tunnel.
func clientIP(r *http.Request) string {
	if ip := net.ParseIP(strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))); ip != nil {
		return ip.String()
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func writeRateLimited(w http.ResponseWriter, retryAfter, message string) {
	w.Header().Set("Retry-After", retryAfter)
	writeOpenAIError(w, http.StatusTooManyRequests, message, "rate_limit_error", strPtr("rate_limit_exceeded"))
}

func authorizedRequest(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, chatKey, adminKey string) (authIdentity, bool) {
	ident := authorize(r.Context(), pool, chatKey, adminKey, r)
	if ident.unavailable {
		writeOpenAIError(w, http.StatusServiceUnavailable, "Authentication service unavailable.", "server_error", nil)
		return ident, false
	}
	if !ident.ok {
		writeOpenAIError(w, http.StatusUnauthorized, "Invalid API key.", "invalid_request_error", strPtr("invalid_api_key"))
		return ident, false
	}
	return ident, true
}
