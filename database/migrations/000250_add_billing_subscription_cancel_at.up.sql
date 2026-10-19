BEGIN;

ALTER TABLE billing_subscriptions
  ADD COLUMN cancel_at TIMESTAMPTZ;

COMMIT;
