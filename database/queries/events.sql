-- name: InsertLogInstanceEvents :batchexec
INSERT INTO
  log_instance_events(instance_id, type, storage, events, object_key, size_bytes)
VALUES
  ($1, $2, $3, $4, $5, $6)
;

-- name: InstanceEvent :one
SELECT
  log_instance_events.*
FROM
  log_instance_events
LEFT JOIN
    log_instances
    ON log_instance_events.instance_id = log_instances.id
WHERE
  instance_id = $1 AND
  log_instance_events.type =sqlc.arg('type') :: text :: log_instance_event_type
;

-- name: GetParsedBytesByOwner :one
SELECT
  COALESCE(SUM(lie.size_bytes), 0)::bigint AS parsed_bytes,
  COUNT(DISTINCT lie.instance_id)::bigint AS parsed_instance_count
FROM log_instance_events lie
JOIN log_instances li ON li.id = lie.instance_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
WHERE wlg.owner = $1
;

-- name: ListEventObjectDeletionOutbox :many
SELECT *
FROM event_object_deletion_outbox
ORDER BY created_at, id
LIMIT $1
;

-- name: DeleteEventObjectDeletionOutbox :exec
DELETE FROM event_object_deletion_outbox
WHERE id = $1
;

-- name: RecordEventObjectDeletionFailure :exec
UPDATE event_object_deletion_outbox
SET attempts = attempts + 1,
    last_error = $2,
    updated_at = NOW()
WHERE id = $1
;