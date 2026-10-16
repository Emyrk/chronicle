BEGIN;

CREATE TABLE billing_reconciliation_runs (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  subscriptions_seen INTEGER NOT NULL DEFAULT 0,
  subscriptions_changed INTEGER NOT NULL DEFAULT 0,
  subscriptions_skipped_invalid INTEGER NOT NULL DEFAULT 0,
  error_text TEXT NOT NULL DEFAULT ''
);

CREATE INDEX billing_reconciliation_runs_started_at_idx
  ON billing_reconciliation_runs (started_at DESC);

COMMIT;
