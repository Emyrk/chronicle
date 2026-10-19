BEGIN;

ALTER TABLE billing_subscriptions
  DROP COLUMN cancel_at;

COMMIT;
