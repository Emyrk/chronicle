BEGIN;

CREATE TABLE billing_grants (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  months INTEGER NOT NULL CHECK (months > 0),
  reason TEXT NOT NULL,
  granted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX billing_grants_active_idx
  ON billing_grants (user_id, expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
