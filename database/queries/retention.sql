-- name: GetRetentionPolicies :many
SELECT
  rp.*
FROM retention_policies rp
WHERE rp.enabled = true;

-- name: GetRetentionPolicyForRealm :one
-- Returns the realm-specific policy if it exists, otherwise the server-level policy.
SELECT
  rp.*
FROM retention_policies rp
WHERE rp.enabled = true
  AND (
    rp.realm_id = @realm_id
    OR (
      rp.server_id = (SELECT server_id FROM wow_server_realms WHERE id = @realm_id)
      AND NOT EXISTS (
        SELECT 1 FROM retention_policies rp2
        WHERE rp2.realm_id = @realm_id AND rp2.enabled = true
      )
    )
  )
LIMIT 1;

-- name: GetRetentionRulesByPolicy :many
SELECT
  rr.*
FROM retention_rules rr
WHERE rr.policy_id = @policy_id
ORDER BY rr.priority ASC;

-- name: GetInstancesForRetentionCheck :many
-- Fetches all log instances for a given realm with pre-joined speedrun rank data.
-- Used by the preview endpoint (admin-only, synchronous).
SELECT
  li.id,
  li.name AS instance_name,
  li.end_time,
  li.log_group_id,
  gsr.guild_rank
FROM log_instances li
LEFT JOIN guild_speedrun_ranks gsr ON gsr.instance_id = li.id
WHERE li.realm_id = @realm_id
  AND li.end_time IS NOT NULL;

-- name: GetInstancesForRetentionCheckPaged :many
-- Fetches a page of log instances for cursor-based retention processing.
-- Ordered by end_time ASC so older logs are processed first.
SELECT
  li.id,
  li.name AS instance_name,
  li.end_time,
  li.log_group_id,
  gsr.guild_rank
FROM log_instances li
LEFT JOIN guild_speedrun_ranks gsr ON gsr.instance_id = li.id
WHERE li.realm_id = @realm_id
  AND li.end_time IS NOT NULL
  AND (li.end_time > @cursor_time OR (li.end_time = @cursor_time AND li.id > @cursor_id::uuid))
ORDER BY li.end_time ASC, li.id ASC
LIMIT @page_size;

-- name: DeleteLogInstancesByIDs :execrows
WITH enqueued AS (
  INSERT INTO event_object_deletion_outbox (object_key)
  SELECT object_key
  FROM log_instance_events
  WHERE instance_id = ANY(@ids::uuid[])
    AND storage = 'r2'
    AND object_key IS NOT NULL
  ON CONFLICT (object_key) DO NOTHING
)
DELETE FROM log_instances
WHERE id = ANY(@ids::uuid[]);

-- name: ListAllRetentionPolicies :many
SELECT
  rp.*
FROM retention_policies rp
ORDER BY rp.created_at ASC;

-- name: GetRetentionPolicy :one
SELECT
  rp.*
FROM retention_policies rp
WHERE rp.id = @id;

-- name: UpsertRetentionPolicy :one
INSERT INTO retention_policies (server_id, realm_id, enabled)
VALUES (@server_id, @realm_id, @enabled)
ON CONFLICT ON CONSTRAINT retention_policies_unique_server
  DO UPDATE SET enabled = @enabled, updated_at = now()
  WHERE retention_policies.server_id IS NOT NULL
RETURNING *;

-- name: UpsertRetentionPolicyByRealm :one
INSERT INTO retention_policies (realm_id, enabled)
VALUES (@realm_id, @enabled)
ON CONFLICT ON CONSTRAINT retention_policies_unique_realm
  DO UPDATE SET enabled = @enabled, updated_at = now()
RETURNING *;

-- name: DeleteRetentionPolicy :exec
DELETE FROM retention_policies
WHERE id = @id;

-- name: UpsertRetentionRule :one
INSERT INTO retention_rules (policy_id, priority, action, conditions, description)
VALUES (@policy_id, @priority, @action, @conditions, @description)
ON CONFLICT ON CONSTRAINT retention_rules_unique_priority
  DO UPDATE SET
    action = @action,
    conditions = @conditions,
    description = @description
RETURNING *;

-- name: DeleteRetentionRule :exec
DELETE FROM retention_rules
WHERE id = @id;

-- name: UpdateRetentionPolicyStats :exec
UPDATE retention_policies
SET
  last_run_at = now(),
  total_deleted = total_deleted + @deleted::bigint,
  total_kept = total_kept + @kept::bigint,
  updated_at = now()
WHERE id = @id;

-- name: GetRealmsWithRetentionPolicies :many
-- Returns all realm IDs that have an applicable retention policy
-- (either directly or through their server).
SELECT DISTINCT wsr.id AS realm_id
FROM wow_server_realms wsr
WHERE EXISTS (
  SELECT 1 FROM retention_policies rp
  WHERE rp.enabled = true
    AND (rp.realm_id = wsr.id OR rp.server_id = wsr.server_id)
);
