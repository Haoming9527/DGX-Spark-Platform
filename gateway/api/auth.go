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

type authIdentity struct {
	ok     bool
	keyID  string
	userID string
	role   string
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
		return authIdentity{}
	}

	sum := sha256.Sum256(rawB)
	hash := hex.EncodeToString(sum[:])

	var keyID, userID, role string
	var disabled bool
	err := pool.QueryRow(ctx, `
		SELECT k.id, u.id, u.role, (u.disabled_at IS NOT NULL)
		FROM api_keys k
		JOIN users u ON u.id = k.user_id
		WHERE k.key_hash = $1
		LIMIT 1
	`, hash).Scan(&keyID, &userID, &role, &disabled)
	if err != nil {
		return authIdentity{}
	}
	if disabled {
		return authIdentity{}
	}
	if role != "admin" {
		role = "user"
	}
	return authIdentity{ok: true, keyID: keyID, userID: userID, role: role}
}
