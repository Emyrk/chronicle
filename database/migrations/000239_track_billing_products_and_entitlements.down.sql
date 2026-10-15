BEGIN;

ALTER TABLE billing_grants
  RENAME COLUMN product_code TO tier;

ALTER TABLE billing_subscriptions
  RENAME CONSTRAINT billing_subscriptions_provider_customer_id_key
  TO billing_subscriptions_stripe_customer_id_key;
ALTER TABLE billing_subscriptions
  RENAME CONSTRAINT billing_subscriptions_provider_subscription_id_key
  TO billing_subscriptions_stripe_subscription_id_key;

ALTER TABLE billing_subscriptions
  DROP COLUMN provider_price_id,
  DROP COLUMN provider_product_id,
  DROP COLUMN provider;
ALTER TABLE billing_subscriptions
  RENAME COLUMN product_code TO tier;
ALTER TABLE billing_subscriptions
  RENAME COLUMN provider_subscription_id TO stripe_subscription_id;
ALTER TABLE billing_subscriptions
  RENAME COLUMN provider_customer_id TO stripe_customer_id;

COMMIT;
