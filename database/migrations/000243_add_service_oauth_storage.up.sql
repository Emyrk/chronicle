BEGIN;

CREATE TABLE oauth_server_secrets (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  secret BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_device_sessions (
  device_signature TEXT PRIMARY KEY,
  user_signature TEXT NOT NULL UNIQUE,
  request JSONB NOT NULL,
  invalidated BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_token_sessions (
  token_type TEXT NOT NULL CHECK (token_type IN ('access', 'refresh', 'authorize')),
  signature TEXT NOT NULL,
  request_id TEXT NOT NULL,
  access_signature TEXT NOT NULL DEFAULT '',
  request JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (token_type, signature)
);

CREATE INDEX oauth_device_sessions_expires_at_idx
  ON oauth_device_sessions (expires_at);

CREATE INDEX oauth_token_sessions_request_id_idx
  ON oauth_token_sessions (request_id, token_type);

CREATE INDEX oauth_token_sessions_expires_at_idx
  ON oauth_token_sessions (expires_at);

COMMIT;
