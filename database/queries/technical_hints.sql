-- name: TechnicalHintActivityTotals :one
-- Counts public, finalized activity in a bounded window. Joining realms applies
-- the same tenant RLS scope as the public recent-instances endpoint.
WITH visible_instances AS (
    SELECT
        li.log_group_id,
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        plg.finalized_at,
        COALESCE(li.start_time, wlg.created_at) AS activity_time
    FROM log_instances li
    JOIN parsed_log_group plg ON plg.id = li.log_group_id
    JOIN wow_log_groups wlg ON wlg.id = plg.id
      AND plg.parse_generation = wlg.parse_generation
      AND plg.finalized_at IS NOT NULL
      AND NOT wlg.unlisted
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
)
SELECT
    COUNT(DISTINCT log_group_id) FILTER (
        WHERE finalized_at >= @start_time::timestamptz
          AND finalized_at < @end_time::timestamptz
    )::bigint AS logs_processed,
    COUNT(DISTINCT run_id) FILTER (
        WHERE activity_time >= @start_time::timestamptz
          AND activity_time < @end_time::timestamptz
    )::bigint AS instance_runs
FROM visible_instances;

-- name: TechnicalHintMostActiveInstances :many
-- Instance names are normalized the same way as the public recent-instances
-- query, and each duplicate group contributes exactly one logical run.
WITH visible_runs AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) AS instance_name
    FROM log_instances li
    JOIN parsed_log_group plg ON plg.id = li.log_group_id
    JOIN wow_log_groups wlg ON wlg.id = plg.id
      AND plg.parse_generation = wlg.parse_generation
      AND plg.finalized_at IS NOT NULL
      AND NOT wlg.unlisted
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    LEFT JOIN server_upload_meta sm ON sm.log_group_id = li.log_group_id
    WHERE COALESCE(li.start_time, wlg.created_at) >= @start_time::timestamptz
      AND COALESCE(li.start_time, wlg.created_at) < @end_time::timestamptz
      AND COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), NULL) IS NOT NULL
    ORDER BY
        COALESCE(li.duplicate_group_id, li.id),
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.id
)
SELECT
    instance_name,
    COUNT(*)::bigint AS run_count
FROM visible_runs
GROUP BY instance_name
ORDER BY run_count DESC, instance_name ASC
LIMIT @limit_count;
