-- name: GetBillingSubscriptionByUserID :one
SELECT * FROM billing_subscriptions
WHERE user_id = $1;

-- name: GetBillingSubscriptionByProviderID :one
SELECT * FROM billing_subscriptions
WHERE provider = $1
  AND provider_subscription_id = $2;

-- name: UpsertBillingSubscription :one
INSERT INTO billing_subscriptions (
  user_id,
  provider,
  provider_customer_id,
  provider_subscription_id,
  provider_product_id,
  provider_price_id,
  product_code,
  status,
  current_period_end,
  cancel_at_period_end
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (user_id) DO UPDATE SET
  provider = EXCLUDED.provider,
  provider_customer_id = EXCLUDED.provider_customer_id,
  provider_subscription_id = EXCLUDED.provider_subscription_id,
  provider_product_id = EXCLUDED.provider_product_id,
  provider_price_id = EXCLUDED.provider_price_id,
  product_code = EXCLUDED.product_code,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end,
  cancel_at_period_end = EXCLUDED.cancel_at_period_end,
  updated_at = NOW()
RETURNING *;

-- name: GetLatestActiveBillingGrantExpiry :one
SELECT MAX(expires_at)::timestamptz
FROM billing_grants
WHERE user_id = $1
  AND revoked_at IS NULL
  AND expires_at > NOW();

-- name: InsertBillingGrant :one
INSERT INTO billing_grants (
  id,
  user_id,
  product_code,
  starts_at,
  expires_at,
  months,
  reason,
  granted_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: HasActiveBillingGrant :one
SELECT EXISTS (
  SELECT 1
  FROM billing_grants
  WHERE user_id = $1
    AND product_code = $2
    AND revoked_at IS NULL
    AND starts_at <= NOW()
    AND expires_at > NOW()
);

-- name: GetBillingWebhookEvent :one
SELECT * FROM billing_webhook_events
WHERE stripe_event_id = $1;

-- name: InsertBillingWebhookEvent :execrows
INSERT INTO billing_webhook_events (stripe_event_id, event_type)
VALUES ($1, $2)
ON CONFLICT (stripe_event_id) DO NOTHING;

-- name: MarkBillingWebhookEventProcessed :exec
UPDATE billing_webhook_events
SET processed_at = NOW()
WHERE stripe_event_id = $1;
