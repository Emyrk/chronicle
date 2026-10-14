-- name: IsLogInstanceInvalid :one
SELECT (invalidated_at IS NOT NULL)::boolean
FROM log_instances
WHERE id = @id;

-- name: GetLogInstanceStartTime :one
-- Return the start_time for a log instance. Used by the parses handler
-- to resolve which snapshot cutoff applies to the instance.
SELECT start_time FROM log_instances WHERE id = @id;

-- name: ListRankingsForInstance :many
-- Load ranking rows for a specific instance directly from encounter_dps_rankings.
-- Used by the parses handler to get the viewed instance's own metric values
-- independent of snapshot membership (the instance may not be a member of the
-- snapshot it scores against, e.g. historical canonical snapshots).
SELECT
    edr.id,
    COALESCE(li.duplicate_group_id, li.id) AS run_id,
    edr.encounter_name,
    edr.instance_name,
    edr.player_guid,
    edr.player_name,
    edr.player_class,
    edr.player_spec,
    edr.player_sub_spec,
    edr.player_role,
    edr.difficulty_name,
    edr.max_players,
    edr.killed_at,
    edr.created_at,
    edr.damage_done,
    edr.healing_done,
    edr.absorbed_done,
    edr.duration_secs,
    edr.dps,
    edr.hps
FROM encounter_dps_rankings edr
JOIN log_instances li ON li.id = edr.instance_id
WHERE edr.instance_id = @instance_id
  AND edr.encounter_id IS NOT NULL  -- boss kills only
ORDER BY edr.encounter_name, edr.dps DESC;

