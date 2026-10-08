BEGIN;

CREATE TABLE oauth_relay_codes (
  code_hash BYTEA PRIMARY KEY,
  user_auth_session_id UUID NOT NULL REFERENCES user_auth_session(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  redirect_path TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oauth_relay_codes_code_hash_length CHECK (octet_length(code_hash) = 32)
);

CREATE INDEX oauth_relay_codes_expires_at_idx ON oauth_relay_codes(expires_at);

COMMIT;
