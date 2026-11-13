-- name: CreateEventRepairOperation :one
INSERT INTO event_repair_operations (id, operation, version, created_by, tenant_id, selection, total)
VALUES (@id, @operation, @version, @created_by, @tenant_id, @selection, @total)
RETURNING *;

-- name: ListEventRepairOperations :many
SELECT * FROM event_repair_operations WHERE tenant_id = @tenant_id
ORDER BY created_at DESC, id
LIMIT @limit_count::integer OFFSET @offset_count::integer;

-- name: GetEventRepairOperation :one
SELECT * FROM event_repair_operations WHERE id = @id AND tenant_id = @tenant_id;

-- name: LockEventRepairOperation :one
SELECT * FROM event_repair_operations WHERE id = @id AND tenant_id = @tenant_id FOR UPDATE;

-- name: UpdateEventRepairOperation :one
UPDATE event_repair_operations SET state = @state, total = @total,
  processed = @processed, applied = @applied, skipped = @skipped,
  last_error = @last_error, updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id RETURNING *;

-- name: InsertEventRepairItem :one
INSERT INTO event_repair_items (operation_id, instance_id)
SELECT o.id, @instance_id FROM event_repair_operations o
WHERE o.id = @operation_id AND o.tenant_id = @tenant_id
RETURNING *;

-- name: ListEventRepairItems :many
SELECT i.* FROM event_repair_items i JOIN event_repair_operations o ON o.id = i.operation_id
WHERE i.operation_id = @operation_id AND o.tenant_id = @tenant_id
ORDER BY i.instance_id LIMIT @limit_count::integer OFFSET @offset_count::integer;

-- name: GetEventRepairItem :one
SELECT i.* FROM event_repair_items i JOIN event_repair_operations o ON o.id = i.operation_id
WHERE i.operation_id = @operation_id AND o.tenant_id = @tenant_id AND i.instance_id = @instance_id;

-- name: LockEventRepairItem :one
SELECT i.* FROM event_repair_items i JOIN event_repair_operations o ON o.id = i.operation_id
WHERE i.operation_id = @operation_id AND o.tenant_id = @tenant_id AND i.instance_id = @instance_id FOR UPDATE OF i;

-- name: ListPendingEventRepairItems :many
SELECT i.* FROM event_repair_items i JOIN event_repair_operations o ON o.id = i.operation_id
WHERE i.operation_id = @operation_id AND o.tenant_id = @tenant_id AND i.state = 'pending'
ORDER BY i.instance_id LIMIT 25;

-- name: ListReadyEventRepairItems :many
SELECT i.* FROM event_repair_items i JOIN event_repair_operations o ON o.id = i.operation_id
WHERE i.operation_id = @operation_id AND o.tenant_id = @tenant_id AND i.state = 'ready'
ORDER BY i.instance_id LIMIT 25;

-- name: UpdateEventRepairItem :one
UPDATE event_repair_items i SET state = @state, reason = @reason,
  evidence_hash = @evidence_hash, changes = @changes, plan = @plan
FROM event_repair_operations o
WHERE i.operation_id = @operation_id AND i.instance_id = @instance_id
  AND o.id = i.operation_id AND o.tenant_id = @tenant_id
RETURNING i.*;

-- name: SelectEventRepairInstances :many
SELECT i.* FROM log_instances i
JOIN wow_server_realms r ON r.id = i.realm_id
JOIN wow_servers s ON s.id = r.server_id
WHERE s.tenant_id = @tenant_id
  AND (@instance_name::text = '' OR i.name = @instance_name::text)
  AND (sqlc.narg('realm_id')::uuid IS NULL OR i.realm_id = sqlc.narg('realm_id'))
  AND (sqlc.narg('after_date')::timestamptz IS NULL OR i.start_time >= sqlc.narg('after_date'))
  AND (sqlc.narg('before_date')::timestamptz IS NULL OR i.start_time < sqlc.narg('before_date'))
ORDER BY i.start_time DESC NULLS LAST, i.id
LIMIT LEAST(GREATEST(@limit_count::integer, 0), 1000);

-- name: ResolveEventRepairInstance :one
-- The service normalizes URLs to their last path segment before this lookup.
SELECT i.* FROM log_instances i
JOIN wow_server_realms r ON r.id = i.realm_id
JOIN wow_servers s ON s.id = r.server_id
WHERE s.tenant_id = @tenant_id
  AND (i.id::text = @reference::text OR i.hashed_slug = @reference::text)
ORDER BY (i.id::text = @reference::text) DESC, i.id
LIMIT 1;

-- name: RequestEventRepairApply :one
UPDATE event_repair_operations
SET state = 'applying', applied_by = @applied_by::uuid,
  apply_requested_at = now(), updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id AND state = 'ready'
RETURNING *;

-- name: CancelEventRepairOperation :one
UPDATE event_repair_operations
SET state = 'cancelled', cancelled_by = @cancelled_by::uuid,
  cancelled_at = now(), updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id
  AND state IN ('dry_running', 'ready', 'applying')
RETURNING *;

-- name: ListEventRepairPendingItems :many
SELECT i.* FROM event_repair_items i
JOIN event_repair_operations o ON o.id = i.operation_id
WHERE i.operation_id = @operation_id AND o.tenant_id = @tenant_id
  AND i.state = @state
ORDER BY i.instance_id LIMIT 25;

-- name: RefreshEventRepairProgress :one
-- Caller holds the operation lock while processing its page and refreshing totals.
UPDATE event_repair_operations o
SET total = counts.total, processed = counts.processed,
  applied = counts.applied, skipped = counts.skipped,
  state = CASE
    WHEN o.state = 'dry_running' AND counts.pending = 0 THEN 'ready'
    WHEN o.state = 'applying' AND counts.ready = 0 THEN 'completed'
    ELSE o.state
  END,
  updated_at = now()
FROM (
  SELECT count(*)::integer AS total,
    count(*) FILTER (WHERE i.state <> 'pending')::integer AS processed,
    count(*) FILTER (WHERE i.state = 'applied')::integer AS applied,
    count(*) FILTER (WHERE i.state IN ('skipped', 'stale'))::integer AS skipped,
    count(*) FILTER (WHERE i.state = 'pending')::integer AS pending,
    count(*) FILTER (WHERE i.state = 'ready')::integer AS ready
  FROM event_repair_items i
  JOIN event_repair_operations parent ON parent.id = i.operation_id
  WHERE i.operation_id = @id AND parent.tenant_id = @tenant_id
) counts
WHERE o.id = @id AND o.tenant_id = @tenant_id
RETURNING o.*;

-- name: UpdateEventRepairOperationState :one
UPDATE event_repair_operations
SET state = @state, last_error = @last_error, updated_at = now()
WHERE id = @id AND tenant_id = @tenant_id
RETURNING *;
