-- name: LandingPositionalInstances :many
-- The newest public, listed, finalized instances on the tenant whose log
-- recorded unit positions and that have a boss encounter, for the /start
-- hero's pick. Newest first.
SELECT li.id, li.realm_id
FROM log_instances li
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
  AND NOT wlg.unlisted
WHERE 'unit-position' = ANY(li.capabilities)
  AND li.invalidated_at IS NULL
  AND EXISTS (
      SELECT 1
      FROM log_instance_encounters lie
      WHERE lie.instance_id = li.id
        AND lie.boss
        AND lie.kill_type IN ('clean', 'partial', 'wipe')
  )
ORDER BY COALESCE(li.start_time, wlg.created_at) DESC, li.id DESC
LIMIT @limit_count::int;
