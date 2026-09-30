-- Keep in sync with prisma/schema.prisma (Next.js) and gateway raw SQL auth.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'operator', 'admin')),
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'operator', 'admin')) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_role_check;

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
    status_code INT NOT NULL,
    model VARCHAR(256)
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_timestamp ON api_key_usage(key_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_model_ts ON api_key_usage(key_id, model, timestamp DESC);

CREATE TABLE IF NOT EXISTS restricted_models (
    model_name VARCHAR(256) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    key_hash VARCHAR(64) PRIMARY KEY,
    requests INTEGER NOT NULL CHECK (requests > 0),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expires_at ON rate_limit_buckets(expires_at);

CREATE TABLE IF NOT EXISTS mcp_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    url VARCHAR(2048) NOT NULL,
    auth VARCHAR(10) NOT NULL CHECK (auth IN ('oauth', 'none', 'auto', 'token')),
    credentials TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mcp_connections_user ON mcp_connections(user_id);

CREATE TABLE IF NOT EXISTS mcp_oauth_states (
    state_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
    session_hash VARCHAR(64) NOT NULL,
    payload TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_states_expiry ON mcp_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS mcp_calls (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_mcp_calls_expiry ON mcp_calls(expires_at);

COMMIT;
