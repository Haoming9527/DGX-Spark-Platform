package main

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func logUsage(ctx context.Context, pool *pgxpool.Pool, keyID string, status int) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := pool.Exec(ctx, `UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1`, keyID); err != nil {
		log.Printf("last_used_at update failed: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO api_key_usage (key_id, tokens, prompt_tokens, completion_tokens, status_code)
		 VALUES ($1, 0, 0, 0, $2)`,
		keyID, status); err != nil {
		log.Printf("usage insert failed: %v", err)
	}
}
