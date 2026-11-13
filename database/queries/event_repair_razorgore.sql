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

-- name: RazorgoreRepairRankingWindow :exec
UPDATE log_instance_encounters
SET ranking_start_offset_ms = @start_ms, ranking_end_offset_ms = @end_ms
WHERE id = @encounter_id AND instance_id = @instance_id;

-- name: RazorgoreRepairMetrics :exec
UPDATE encounter_dps_rankings
SET damage_done = @damage_done, unranked_damage_done = @unranked_damage_done,
 healing_done = @healing_done, absorbed_done = @absorbed_done,
 duration_secs = @duration_secs, dps = @dps, hps = @hps,
 player_role = @player_role, player_deaths = @player_deaths,
 alive_percentage = @alive_percentage
WHERE id = @id AND instance_id = @instance_id AND encounter_id = @encounter_id;

-- name: RazorgoreRepairLogGroup :one
SELECT * FROM wow_log_groups WHERE id = @id;

-- name: RazorgoreRepairSpeedrunProof :exec
UPDATE instance_speedruns SET proof = @proof, qualified = @qualified,
 completion_time = @completion_time, duration_ms = @duration_ms,
 ranked_completion_time = @ranked_completion_time, ranked_duration_ms = @ranked_duration_ms,
 boss_to_boss_completion_time = @boss_to_boss_completion_time, boss_to_boss_duration_ms = @boss_to_boss_duration_ms
WHERE instance_id = @instance_id;
