-- Database schema for DGX Spark Platform

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    referral_code VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at TIMESTAMPTZ
);

-- Index for fast lookup by key hash
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- 3. API Key Usage Table (New detailed telemetry logger)
CREATE TABLE IF NOT EXISTS api_key_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tokens BIGINT DEFAULT 0 NOT NULL,
    prompt_tokens BIGINT DEFAULT 0 NOT NULL,
    completion_tokens BIGINT DEFAULT 0 NOT NULL,
    status_code INT NOT NULL
);

-- Index for fast daily aggregation and lookup by key
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_timestamp ON api_key_usage(key_id, timestamp DESC);

-- Existing database migration helpers
ALTER TABLE api_key_usage
    ALTER COLUMN tokens TYPE BIGINT,
    ALTER COLUMN prompt_tokens TYPE BIGINT,
    ALTER COLUMN completion_tokens TYPE BIGINT;

ALTER TABLE api_keys
    DROP COLUMN IF EXISTS total_tokens,
    DROP COLUMN IF EXISTS total_requests;
