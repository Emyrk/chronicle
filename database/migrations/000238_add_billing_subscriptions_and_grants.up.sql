BEGIN;

CREATE TABLE billing_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_grants (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
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

CREATE TABLE billing_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

COMMIT;
