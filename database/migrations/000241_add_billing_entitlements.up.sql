BEGIN;

CREATE TABLE billing_entitlements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  provider_entitlement_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_customer_id, entitlement_key),
  UNIQUE (provider, provider_entitlement_id)
);

CREATE INDEX billing_entitlements_user_key_idx
  ON billing_entitlements (user_id, entitlement_key);

COMMIT;
