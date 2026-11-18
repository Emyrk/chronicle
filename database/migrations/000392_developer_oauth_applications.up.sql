BEGIN;

CREATE TABLE oauth_developer_apps (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  secret_hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_used_refresh_tokens (
  signature TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  request JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX oauth_used_refresh_tokens_expires_at_idx ON oauth_used_refresh_tokens (expires_at);

COMMIT;
