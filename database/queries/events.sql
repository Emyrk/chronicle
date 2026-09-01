-- name: InsertLogInstanceEvents :batchexec
INSERT INTO
  log_instance_events(instance_id, type, events)
VALUES
  ($1, $2, $3)
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
  COALESCE(SUM(octet_length(lie.events)), 0)::bigint AS parsed_bytes,
  COUNT(DISTINCT lie.instance_id)::bigint AS parsed_instance_count
FROM log_instance_events lie
JOIN log_instances li ON li.id = lie.instance_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
WHERE wlg.owner = $1
;