-- name: GetSupportSettings :one
SELECT * FROM support_settings WHERE id = TRUE;

-- name: UpdateSupportSettings :one
UPDATE support_settings SET
    public_enabled = @public_enabled,
    currency = @currency,
    monthly_goal_cents = @monthly_goal_cents,
    updated_at = NOW()
WHERE id = TRUE
RETURNING *;

-- name: ListSupportServices :many
SELECT * FROM support_services
ORDER BY display_name, id;

-- name: GetSupportService :one
SELECT * FROM support_services WHERE id = $1;

-- name: InsertSupportService :one
INSERT INTO support_services (id, provider, display_name, public_url, enabled)
VALUES ($1, @provider, @display_name, @public_url, @enabled)
RETURNING *;

-- name: UpdateSupportService :one
UPDATE support_services SET
    provider = @provider,
    display_name = @display_name,
    public_url = @public_url,
    enabled = @enabled,
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: DeleteSupportService :exec
DELETE FROM support_services WHERE id = $1;

-- name: UpsertSupportServiceMonthlyTotal :one
INSERT INTO support_service_monthly_totals (
    service_id, month, received_cents, recurring_cents
) VALUES (
    @service_id, @month, @received_cents, @recurring_cents
)
ON CONFLICT (service_id, month) DO UPDATE SET
    received_cents = EXCLUDED.received_cents,
    recurring_cents = EXCLUDED.recurring_cents,
    updated_at = NOW()
RETURNING *;

-- name: GetSupportSummary :many
SELECT
    s.id AS service_id,
    s.provider,
    s.display_name,
    s.public_url,
    COALESCE(t.received_cents, 0)::BIGINT AS received_cents,
    COALESCE(t.recurring_cents, 0)::BIGINT AS recurring_cents,
    t.updated_at
FROM support_services s
LEFT JOIN support_service_monthly_totals t
    ON t.service_id = s.id
   AND t.month = @month
WHERE s.enabled = TRUE
ORDER BY s.display_name, s.id;

-- name: GetSupportAdminServices :many
SELECT
    sqlc.embed(s),
    COALESCE(t.received_cents, 0)::BIGINT AS received_cents,
    COALESCE(t.recurring_cents, 0)::BIGINT AS recurring_cents,
    t.updated_at AS totals_updated_at
FROM support_services s
LEFT JOIN support_service_monthly_totals t
    ON t.service_id = s.id
   AND t.month = @month
ORDER BY s.display_name, s.id;
