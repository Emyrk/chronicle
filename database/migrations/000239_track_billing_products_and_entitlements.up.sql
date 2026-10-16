BEGIN;

ALTER TABLE billing_subscriptions
  RENAME COLUMN stripe_customer_id TO provider_customer_id;
ALTER TABLE billing_subscriptions
  RENAME COLUMN stripe_subscription_id TO provider_subscription_id;
ALTER TABLE billing_subscriptions
  RENAME COLUMN tier TO product_code;
ALTER TABLE billing_subscriptions
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN provider_product_id TEXT,
  ADD COLUMN provider_price_id TEXT;

ALTER TABLE billing_subscriptions
  RENAME CONSTRAINT billing_subscriptions_stripe_customer_id_key
  TO billing_subscriptions_provider_customer_id_key;
ALTER TABLE billing_subscriptions
  RENAME CONSTRAINT billing_subscriptions_stripe_subscription_id_key
  TO billing_subscriptions_provider_subscription_id_key;

ALTER TABLE billing_grants
  RENAME COLUMN tier TO product_code;

COMMIT;
