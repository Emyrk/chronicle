-- name: RazorgoreRepairInstance :one
SELECT * FROM log_instances WHERE id = @instance_id;

-- name: RazorgoreRepairEvents :many
SELECT * FROM log_instance_events WHERE instance_id = @instance_id ORDER BY type;

-- name: RazorgoreRepairRankings :many
SELECT * FROM encounter_dps_rankings WHERE instance_id = @instance_id ORDER BY id;

-- name: RazorgoreRepairSpeedruns :many
SELECT * FROM instance_speedruns WHERE instance_id = @instance_id;

-- name: RazorgoreRepairEncounter :exec
UPDATE log_instance_encounters SET kill_type = @kill_type,
 ranking_start_offset_ms = NULL, ranking_end_offset_ms = NULL
WHERE instance_id = @instance_id AND id = @encounter_id;

-- name: RazorgoreRepairHostile :exec
UPDATE log_instance_encounter_hostiles SET periods = @periods
WHERE encounter_id = @encounter_id AND id = @id;

-- name: RazorgoreRepairPhase :exec
UPDATE log_instance_encounter_phases SET kill_type = @kill_type
WHERE encounter_id = @encounter_id AND id = @id;

-- name: RazorgoreRepairDeleteRankings :exec
DELETE FROM encounter_dps_rankings WHERE instance_id = @instance_id AND encounter_id = @encounter_id;

-- name: RazorgoreRepairDeleteSpeedrun :exec
DELETE FROM instance_speedruns WHERE instance_id = @instance_id;
