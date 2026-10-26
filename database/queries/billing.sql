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
  cancel_at_period_end,
  cancel_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
  cancel_at = EXCLUDED.cancel_at,
  updated_at = NOW()
RETURNING *;

-- name: UpsertBillingSubscriptionIfChanged :execrows
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
  cancel_at_period_end,
  cancel_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
  cancel_at = EXCLUDED.cancel_at,
  updated_at = NOW()
WHERE (billing_subscriptions.provider,
       billing_subscriptions.provider_customer_id,
       billing_subscriptions.provider_subscription_id,
       billing_subscriptions.provider_product_id,
       billing_subscriptions.provider_price_id,
       billing_subscriptions.product_code,
       billing_subscriptions.status,
       billing_subscriptions.current_period_end,
       billing_subscriptions.cancel_at_period_end,
       billing_subscriptions.cancel_at)
  IS DISTINCT FROM
      (EXCLUDED.provider,
       EXCLUDED.provider_customer_id,
       EXCLUDED.provider_subscription_id,
       EXCLUDED.provider_product_id,
       EXCLUDED.provider_price_id,
       EXCLUDED.product_code,
       EXCLUDED.status,
       EXCLUDED.current_period_end,
       EXCLUDED.cancel_at_period_end,
       EXCLUDED.cancel_at);

-- name: GetBillingSubscriptionByProviderCustomerID :one
SELECT * FROM billing_subscriptions
WHERE provider = $1
  AND provider_customer_id = $2;

-- name: GetBillingEntitlementOwnerByProviderCustomerID :one
SELECT user_id FROM billing_entitlements
WHERE provider = $1
  AND provider_customer_id = $2
LIMIT 1;

-- name: ListBillingEntitlementsByUserID :many
SELECT * FROM billing_entitlements
WHERE user_id = $1
ORDER BY entitlement_key;

-- name: HasBillingEntitlement :one
SELECT EXISTS (
  SELECT 1
  FROM billing_entitlements
  WHERE user_id = $1
    AND entitlement_key = $2
);

-- name: DeleteBillingEntitlementsByProviderCustomerID :exec
DELETE FROM billing_entitlements
WHERE provider = $1
  AND provider_customer_id = $2;

-- name: UpsertBillingEntitlement :one
INSERT INTO billing_entitlements (
  user_id,
  provider,
  provider_customer_id,
  provider_entitlement_id,
  entitlement_key
) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (provider, provider_customer_id, entitlement_key) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  provider_entitlement_id = EXCLUDED.provider_entitlement_id,
  synced_at = NOW()
RETURNING *;

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

-- name: ListBillingProviderCustomersForReconciliation :many
SELECT provider, provider_customer_id
FROM billing_subscriptions
UNION
SELECT provider, provider_customer_id
FROM billing_entitlements;

-- name: ListBillingSubscriptionsForReconciliation :many
SELECT * FROM billing_subscriptions
WHERE provider = 'stripe';

-- name: ListRecentBillingSubscriptions :many
SELECT * FROM billing_subscriptions
ORDER BY updated_at DESC
LIMIT $1;

-- name: ListRecentBillingWebhookEvents :many
SELECT * FROM billing_webhook_events
ORDER BY received_at DESC
LIMIT $1;

-- name: InsertBillingReconciliationRun :one
INSERT INTO billing_reconciliation_runs (id, status)
VALUES ($1, 'running')
RETURNING *;

-- name: CompleteBillingReconciliationRun :exec
UPDATE billing_reconciliation_runs
SET status = @status,
    completed_at = NOW(),
    provider_customers_found = @provider_customers_found,
    local_subscriptions_found = @local_subscriptions_found,
    subscriptions_seen = @subscriptions_seen,
    subscriptions_changed = @subscriptions_changed,
    subscriptions_skipped_invalid = @subscriptions_skipped_invalid,
    entitlement_customers_found = @entitlement_customers_found,
    entitlement_customers_synced = @entitlement_customers_synced,
    error_text = @error_text
WHERE id = @id;

-- name: DeleteOldSuccessfulBillingReconciliationRuns :execrows
DELETE FROM billing_reconciliation_runs
WHERE status = 'completed'
  AND error_text = ''
  AND started_at < NOW() - INTERVAL '7 days';

-- name: ListRecentBillingReconciliationRuns :many
SELECT * FROM billing_reconciliation_runs
ORDER BY started_at DESC
LIMIT $1;
