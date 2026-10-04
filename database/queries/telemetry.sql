-- name: GetDeploymentInfo :one
SELECT * FROM deployment_info LIMIT 1;

-- name: UpdateTelemetryHeartbeat :exec
UPDATE deployment_info SET last_telemetry_heartbeat = now();

-- name: TelemetryGetUserCount :one
SELECT COUNT(*)::bigint FROM users;

-- name: TelemetryGetLogFileCount :one
SELECT COUNT(*)::bigint FROM log_file;

-- name: TelemetryGetTotalParsedBytes :one
SELECT COALESCE(SUM(octet_length(events)), 0)::bigint FROM log_instance_events;

-- name: TelemetryGetActiveFileBytes :one
SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM log_file
WHERE storage_deleted_at IS NULL;

-- name: TelemetryGetDeletedFileBytes :one
SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM log_file
WHERE storage_deleted_at IS NOT NULL;

-- name: TelemetryGetLogCountByZone :many
SELECT
    li.name AS zone_name,
    COUNT(*)::bigint AS log_count
FROM log_instances li
GROUP BY li.name;

-- name: EnsureDeploymentToken :one
UPDATE deployment_info
SET deployment_token = COALESCE(deployment_token, $1)
RETURNING deployment_token;

-- name: DeleteAllTelemetryNotices :exec
DELETE FROM telemetry_notices;

-- name: InsertTelemetryNotice :exec
INSERT INTO telemetry_notices (
    id,
    audience,
    category,
    severity,
    title,
    message,
    action_label,
    action_url,
    starts_at,
    expires_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
);

-- name: ListTelemetryNotices :many
SELECT *
FROM telemetry_notices
ORDER BY starts_at DESC NULLS LAST, id;

-- name: ListActivePublicTelemetryNotices :many
SELECT *
FROM telemetry_notices
WHERE audience = 'public'
  AND (starts_at IS NULL OR starts_at <= now())
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY
  CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
  updated_at DESC,
  id;

-- name: ListActiveAdminTelemetryNotices :many
SELECT *
FROM telemetry_notices
WHERE audience = 'admin'
  AND (starts_at IS NULL OR starts_at <= now())
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY
  CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
  updated_at DESC,
  id;
