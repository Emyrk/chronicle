-- name: ListCharacterSummaryInstances :many
-- A character's most recent listed, valid, finalized instance logs for the
-- server-rendered character page summary. Walks
-- idx_log_instance_players_unit_guid_instance for the one character, and
-- keeps one upload per duplicate group.
SELECT id, hashed_slug, name, start_time
FROM (
  SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
    li.id, li.hashed_slug, li.name, li.start_time
  FROM log_instance_players lip
  JOIN log_instances li ON li.id = lip.instance_id
  JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
    AND NOT wlg.unlisted
    AND wlg.invalidated_at IS NULL
  JOIN parsed_log_group plg ON plg.id = li.log_group_id
    AND plg.parse_generation = wlg.parse_generation
    AND plg.finalized_at IS NOT NULL
  WHERE lip.unit_guid = @player_guid
    AND li.realm_id = @realm_id
    AND li.start_time IS NOT NULL
    AND li.invalidated_at IS NULL
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.start_time DESC
) recent
ORDER BY start_time DESC
LIMIT @result_limit;
