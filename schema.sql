-- Keep in sync with prisma/schema.prisma (Next.js) and gateway raw SQL auth.

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    referral_code VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS api_key_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tokens BIGINT DEFAULT 0 NOT NULL,
    prompt_tokens BIGINT DEFAULT 0 NOT NULL,
    completion_tokens BIGINT DEFAULT 0 NOT NULL,
    status_code INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_timestamp ON api_key_usage(key_id, timestamp DESC);

ALTER TABLE api_key_usage
    ALTER COLUMN tokens TYPE BIGINT,
    ALTER COLUMN prompt_tokens TYPE BIGINT,
    ALTER COLUMN completion_tokens TYPE BIGINT;

ALTER TABLE api_keys
    DROP COLUMN IF EXISTS total_tokens,
    DROP COLUMN IF EXISTS total_requests;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

ALTER TABLE api_key_usage
    ADD COLUMN IF NOT EXISTS model VARCHAR(256);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_model_ts
    ON api_key_usage(key_id, model, timestamp DESC);

CREATE TABLE IF NOT EXISTS restricted_models (
    model_name VARCHAR(256) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS restricted_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id UUID,
    key_id UUID,
    model_name VARCHAR(256) NOT NULL,
    action VARCHAR(16) NOT NULL,
    status_code INT NOT NULL,
    path VARCHAR(512) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_restricted_access_audit_at
    ON restricted_access_audit(at DESC);
