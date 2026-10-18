BEGIN;

ALTER TABLE billing_reconciliation_runs
  ADD COLUMN provider_customers_found INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN local_subscriptions_found INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN entitlement_customers_found INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN entitlement_customers_synced INTEGER NOT NULL DEFAULT 0;

COMMIT;
