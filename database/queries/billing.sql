-- name: GetBillingSubscriptionByUserID :one
SELECT * FROM billing_subscriptions
WHERE user_id = $1;

-- name: GetBillingSubscriptionByStripeID :one
SELECT * FROM billing_subscriptions
WHERE stripe_subscription_id = $1;

-- name: UpsertBillingSubscription :one
INSERT INTO billing_subscriptions (
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  tier,
  status,
  current_period_end,
  cancel_at_period_end
) VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (user_id) DO UPDATE SET
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  stripe_subscription_id = EXCLUDED.stripe_subscription_id,
  tier = EXCLUDED.tier,
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
  tier,
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
    AND tier = $2
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
