-- name: ListCareerPlayerBossInputs :many
SELECT s.encounter_name, s.metric,
CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision, 100 * s.raw_peak / b.best_metric) ELSE 0::double precision END AS peak, CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision, 100 * s.raw_form / b.best_metric) ELSE 0::double precision END AS form, CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision, 100 * s.raw_floor / b.best_metric) ELSE 0::double precision END AS floor,
 s.observation_count
 FROM leaderboard_player_boss_subjects s
 JOIN leaderboard_player_boss_benchmarks b ON b.tenant_id = s.tenant_id AND b.instance_name = s.instance_name AND b.difficulty_name = s.difficulty_name AND b.max_players = s.max_players AND b.encounter_name = s.encounter_name AND b.player_class = s.player_class AND b.player_spec = s.player_spec AND b.player_sub_spec = s.player_sub_spec AND b.metric = s.metric
 WHERE s.tenant_id = @tenant_id::uuid AND s.realm_id = @realm_id::uuid
 AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
 AND s.encounter_name = ANY(@bosses::text[])
 AND s.player_guid = @player_guid::text AND s.player_class = @player_class::text
 AND s.player_spec = @player_spec::text AND s.player_sub_spec = @player_sub_spec::text
 AND s.metric IN ('dps', 'hps')
 ORDER BY s.encounter_name, s.metric;

-- name: ListCareerGuildBossInputs :many
SELECT s.encounter_name, 'kill_time'::text AS metric,
LEAST(100::double precision, 100.0 * b.best_duration_ms / s.fastest_duration_ms)::double precision AS peak, LEAST(100::double precision, 100::double precision * b.best_duration_ms * s.form_mean_inverse_ms)::double precision AS form, LEAST(100::double precision, 100::double precision * b.best_duration_ms * s.floor_mean_inverse_ms)::double precision AS floor,
 s.observation_count
 FROM leaderboard_guild_boss_subjects s
 JOIN leaderboard_guild_boss_benchmarks b ON b.tenant_id = s.tenant_id AND b.instance_name = s.instance_name AND b.difficulty_name = s.difficulty_name AND b.max_players = s.max_players AND b.encounter_name = s.encounter_name
 WHERE s.tenant_id = @tenant_id::uuid AND s.realm_id = @realm_id::uuid
 AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
 AND s.encounter_name = ANY(@bosses::text[])
 AND s.guild_id = @guild_id::uuid
 ORDER BY s.encounter_name;

-- name: ListCareerPlayerRenownInputs :many
SELECT encounter_name, count(*)::bigint AS kill_count
FROM leaderboard_career_renown_facts
WHERE tenant_id = @tenant_id::uuid AND realm_id = @realm_id::uuid
 AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint
 AND encounter_name = ANY(@bosses::text[])
 AND player_guid = @player_guid::text AND player_class = @player_class::text
 AND player_spec = @player_spec::text AND player_sub_spec = @player_sub_spec::text
GROUP BY encounter_name ORDER BY encounter_name;

-- name: ListCareerGuildRenownInputs :many
SELECT encounter_name, count(*)::bigint AS kill_count
FROM leaderboard_guild_renown_facts
WHERE tenant_id = @tenant_id::uuid AND realm_id = @realm_id::uuid
 AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint
 AND encounter_name = ANY(@bosses::text[])
 AND guild_id = @guild_id::uuid
GROUP BY encounter_name ORDER BY encounter_name;
