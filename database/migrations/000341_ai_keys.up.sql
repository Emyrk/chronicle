BEGIN;

-- AI keys are short-lived, read-only, GET-only credentials a user pastes into
-- a chat AI as ?ai_key=ck_... Only a SHA-256 hash of the secret is stored.
CREATE TABLE ai_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL is the root community. A key works only in its own community.
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_scope_id UUID GENERATED ALWAYS AS (
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::UUID)
  ) STORED,
  hashed_secret BYTEA NOT NULL UNIQUE,
  -- Opt-in access to the owner's private data (unlisted logs, rosters).
  private_data BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Set when the key is revoked or replaced by a newer key.
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_user_agent TEXT NOT NULL DEFAULT '',
  request_count BIGINT NOT NULL DEFAULT 0
);

-- One unrevoked key per user per community. Creating a key revokes the
-- previous one (expired or not) in the same transaction.
CREATE UNIQUE INDEX ai_keys_one_unrevoked_per_user_tenant
  ON ai_keys (user_id, tenant_scope_id) WHERE revoked_at IS NULL;

COMMIT;
