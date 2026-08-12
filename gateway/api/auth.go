package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func authorize(ctx context.Context, pool *pgxpool.Pool, chatServiceKey string, r *http.Request) (string, bool) {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return "", false
	}
	raw := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	if raw == "" {
		return "", false
	}

	if chatServiceKey != "" &&
		subtle.ConstantTimeCompare([]byte(raw), []byte(chatServiceKey)) == 1 {
		return "", true
	}

	if pool == nil {
		return "", false
	}

	sum := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(sum[:])

	var id string
	err := pool.QueryRow(ctx, `SELECT id FROM api_keys WHERE key_hash = $1 LIMIT 1`, hash).Scan(&id)
	if err != nil {
		return "", false
	}
	return id, true
}
