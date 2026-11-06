-- name: ListLeaderboardV2 :many
-- Read current benchmarks and current resolved awards, never replay observations.
-- Boss arrays are enabled exact identities resolved by the API. The fixed
-- denominator includes missing bosses; filtering never shrinks it per subject.
WITH contributions AS (
SELECT s.realm_id, s.player_guid COLLATE "C" AS subject_id, COALESCE(m.name, s.player_guid)::text AS subject_name,
 CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision, 100 * s.raw_peak / b.best_metric) ELSE 0::double precision END AS peak, CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision, 100 * s.raw_form / b.best_metric) ELSE 0::double precision END AS form, CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision, 100 * s.raw_floor / b.best_metric) ELSE 0::double precision END AS floor,
 0::double precision AS renown, s.observation_count AS sample_count, s.computed_at
 FROM leaderboard_player_boss_subjects s
 LEFT JOIN game_players m ON m.realm_id = s.realm_id AND m.id = s.player_guid
 JOIN leaderboard_player_boss_benchmarks b ON b.tenant_id = s.tenant_id AND b.instance_name = s.instance_name AND b.difficulty_name = s.difficulty_name AND b.max_players = s.max_players AND b.encounter_name = s.encounter_name AND b.player_class = s.player_class AND b.player_spec = s.player_spec AND b.player_sub_spec = s.player_sub_spec AND b.metric = s.metric
 WHERE @subject_kind::text = 'player' AND @board_kind::text = 'boss'
 AND s.tenant_id = @tenant_id::uuid AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR s.realm_id = @realm_filter::uuid)
 AND (@search::text = '' OR position(lower(@search::text) IN lower(COALESCE(m.name, s.player_guid))) > 0)
 AND s.encounter_name = ANY(@bosses::text[])
 AND s.player_class = @player_class::text AND s.player_spec = @player_spec::text AND s.player_sub_spec = @player_sub_spec::text AND s.metric = @metric::text
 UNION ALL
SELECT s.realm_id, s.guild_id::text COLLATE "C" AS subject_id, COALESCE(m.name, s.guild_id::text)::text AS subject_name,
 LEAST(100::double precision, 100.0 * b.best_duration_ms / s.fastest_duration_ms)::double precision AS peak, LEAST(100::double precision, 100::double precision * b.best_duration_ms * s.form_mean_inverse_ms) AS form, LEAST(100::double precision, 100::double precision * b.best_duration_ms * s.floor_mean_inverse_ms) AS floor,
 0::double precision AS renown, s.observation_count AS sample_count, s.computed_at
 FROM leaderboard_guild_boss_subjects s
 LEFT JOIN guilds m ON m.realm_id = s.realm_id AND m.id = s.guild_id
 JOIN leaderboard_guild_boss_benchmarks b ON b.tenant_id = s.tenant_id AND b.instance_name = s.instance_name AND b.difficulty_name = s.difficulty_name AND b.max_players = s.max_players AND b.encounter_name = s.encounter_name
 WHERE @subject_kind::text = 'guild' AND @board_kind::text = 'boss'
 AND s.tenant_id = @tenant_id::uuid AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR s.realm_id = @realm_filter::uuid)
 AND (@search::text = '' OR position(lower(@search::text) IN lower(COALESCE(m.name, s.guild_id::text))) > 0)
 AND s.encounter_name = ANY(@bosses::text[])
 UNION ALL
SELECT s.realm_id, s.guild_id::text COLLATE "C" AS subject_id, COALESCE(m.name, s.guild_id::text)::text AS subject_name,
 LEAST(100::double precision, 100.0 * b.best_duration_ms / s.fastest_duration_ms)::double precision AS peak, LEAST(100::double precision, 100::double precision * b.best_duration_ms * s.form_mean_inverse_ms) AS form, LEAST(100::double precision, 100::double precision * b.best_duration_ms * s.floor_mean_inverse_ms) AS floor,
 0::double precision AS renown, s.observation_count AS sample_count, s.computed_at
 FROM leaderboard_guild_clear_subjects s
 LEFT JOIN guilds m ON m.realm_id = s.realm_id AND m.id = s.guild_id
 JOIN leaderboard_guild_clear_benchmarks b ON b.tenant_id = s.tenant_id AND b.instance_name = s.instance_name AND b.difficulty_name = s.difficulty_name AND b.max_players = s.max_players
 WHERE @subject_kind::text = 'guild' AND @board_kind::text = 'clear'
 AND s.tenant_id = @tenant_id::uuid AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR s.realm_id = @realm_filter::uuid)
 AND (@search::text = '' OR position(lower(@search::text) IN lower(COALESCE(m.name, s.guild_id::text))) > 0)
 UNION ALL
SELECT s.realm_id, s.player_guid COLLATE "C" AS subject_id, COALESCE(m.name, s.player_guid)::text AS subject_name,
 0::double precision AS peak, 0::double precision AS form, 0::double precision AS floor,
 s.kill_count * a.points AS renown, s.kill_count AS sample_count, s.computed_at
 FROM leaderboard_player_renown_counts s
 LEFT JOIN game_players m ON m.realm_id = s.realm_id AND m.id = s.player_guid
 JOIN (SELECT unnest(@bosses::text[]) AS encounter_name, unnest(@awards::double precision[]) AS points) a ON a.encounter_name = s.encounter_name
 WHERE @subject_kind::text = 'player' AND @board_kind::text = 'renown'
 AND s.tenant_id = @tenant_id::uuid AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR s.realm_id = @realm_filter::uuid)
 AND (@search::text = '' OR position(lower(@search::text) IN lower(COALESCE(m.name, s.player_guid))) > 0)
 UNION ALL
SELECT s.realm_id, s.guild_id::text COLLATE "C" AS subject_id, COALESCE(m.name, s.guild_id::text)::text AS subject_name,
 0::double precision AS peak, 0::double precision AS form, 0::double precision AS floor,
 s.kill_count * a.points AS renown, s.kill_count AS sample_count, s.computed_at
 FROM leaderboard_guild_renown_counts s
 LEFT JOIN guilds m ON m.realm_id = s.realm_id AND m.id = s.guild_id
 JOIN (SELECT unnest(@bosses::text[]) AS encounter_name, unnest(@awards::double precision[]) AS points) a ON a.encounter_name = s.encounter_name
 WHERE @subject_kind::text = 'guild' AND @board_kind::text = 'renown'
 AND s.tenant_id = @tenant_id::uuid AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR s.realm_id = @realm_filter::uuid)
 AND (@search::text = '' OR position(lower(@search::text) IN lower(COALESCE(m.name, s.guild_id::text))) > 0)
), grouped AS (
 SELECT realm_id, subject_id, min(subject_name)::text AS subject_name,
 (sum(peak) / NULLIF(@denominator::integer, 0))::double precision AS peak,
 (sum(0.30 * peak + 0.50 * form + 0.20 * floor) / NULLIF(@denominator::integer, 0))::double precision AS mastery,
 sum(renown)::double precision AS renown, sum(sample_count)::bigint AS sample_count,
 min(computed_at) AS computed_at
 FROM contributions GROUP BY realm_id, subject_id
), scored AS (
 SELECT *, CASE @score_metric::text WHEN 'peak' THEN peak WHEN 'mastery' THEN mastery ELSE renown END::double precision AS score
 FROM grouped
)
SELECT realm_id, subject_id::text AS subject_id, subject_name, COALESCE(peak, 0)::double precision AS peak,
 COALESCE(mastery, 0)::double precision AS mastery, renown, sample_count,
 computed_at::timestamptz AS computed_at, score
FROM scored
WHERE NOT @has_cursor::boolean OR score < @after_score::double precision
 OR (score = @after_score::double precision AND (realm_id, subject_id) > (@after_realm::uuid, @after_subject::text))
ORDER BY score DESC, realm_id, subject_id
LIMIT @page_size::integer;

-- name: ListLeaderboardV2Cohorts :many
SELECT DISTINCT player_class, player_spec, player_sub_spec, metric
FROM leaderboard_player_boss_benchmarks
WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text
 AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint
 AND encounter_name = ANY(@bosses::text[])
ORDER BY player_class, player_spec, player_sub_spec, metric;
