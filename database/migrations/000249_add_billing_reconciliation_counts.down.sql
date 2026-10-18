BEGIN;

ALTER TABLE billing_reconciliation_runs
  DROP COLUMN IF EXISTS entitlement_customers_synced,
  DROP COLUMN IF EXISTS entitlement_customers_found,
  DROP COLUMN IF EXISTS local_subscriptions_found,
  DROP COLUMN IF EXISTS provider_customers_found;

COMMIT;
