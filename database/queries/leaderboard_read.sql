-- name: ListLeaderboardV2 :many
-- Read current benchmarks and current resolved awards, never replay observations.
-- Boss arrays are enabled exact identities resolved by the API. The fixed
-- denominator includes missing bosses; filtering never shrinks it per subject.
WITH contributions AS (
SELECT s.realm_id, s.player_guid COLLATE "C" AS subject_id,
 s.player_class COLLATE "C" AS player_class, s.player_spec COLLATE "C" AS player_spec, s.player_sub_spec COLLATE "C" AS player_sub_spec,
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
 AND (@player_class::text = '' OR s.player_class = @player_class::text)
 AND (@player_spec::text = '' OR s.player_spec = @player_spec::text)
 AND (NOT @filter_sub_spec::boolean OR s.player_sub_spec = @player_sub_spec::text) AND s.metric = @metric::text
 UNION ALL
SELECT s.realm_id, s.guild_id::text COLLATE "C" AS subject_id,
 ''::text COLLATE "C" AS player_class, ''::text COLLATE "C" AS player_spec, ''::text COLLATE "C" AS player_sub_spec,
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
SELECT s.realm_id, s.guild_id::text COLLATE "C" AS subject_id,
 ''::text COLLATE "C" AS player_class, ''::text COLLATE "C" AS player_spec, ''::text COLLATE "C" AS player_sub_spec,
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
SELECT s.realm_id, s.player_guid COLLATE "C" AS subject_id,
 ''::text COLLATE "C" AS player_class, ''::text COLLATE "C" AS player_spec, ''::text COLLATE "C" AS player_sub_spec,
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
SELECT s.realm_id, s.guild_id::text COLLATE "C" AS subject_id,
 ''::text COLLATE "C" AS player_class, ''::text COLLATE "C" AS player_spec, ''::text COLLATE "C" AS player_sub_spec,
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
 SELECT realm_id, subject_id, player_class, player_spec, player_sub_spec,
 (sum(peak) / NULLIF(@denominator::integer, 0))::double precision AS peak,
 (sum(form) / NULLIF(@denominator::integer, 0))::double precision AS form,
 (sum(floor) / NULLIF(@denominator::integer, 0))::double precision AS floor,
 (sum(0.30 * peak + 0.50 * form + 0.20 * floor) / NULLIF(@denominator::integer, 0))::double precision AS mastery,
 sum(renown)::double precision AS renown, sum(sample_count)::bigint AS sample_count,
 min(computed_at) AS computed_at
 FROM contributions GROUP BY realm_id, subject_id, player_class, player_spec, player_sub_spec
), scored AS (
 SELECT *, CASE @score_metric::text WHEN 'peak' THEN peak WHEN 'mastery' THEN mastery ELSE renown END::double precision AS score
 FROM grouped
), page AS (
SELECT realm_id, subject_id::text AS subject_id, player_class::text AS player_class, player_spec::text AS player_spec, player_sub_spec::text AS player_sub_spec, COALESCE(peak, 0)::double precision AS peak,
 COALESCE(form, 0)::double precision AS form, COALESCE(floor, 0)::double precision AS floor,
 COALESCE(mastery, 0)::double precision AS mastery, renown, sample_count,
 computed_at::timestamptz AS computed_at, score
FROM scored
WHERE NOT @has_cursor::boolean OR score < @after_score::double precision
 OR (score = @after_score::double precision AND (realm_id, subject_id, player_class, player_spec, player_sub_spec) > (@after_realm::uuid, @after_subject::text, @after_class::text, @after_spec::text, @after_sub_spec::text))
ORDER BY score DESC, realm_id, subject_id, player_class, player_spec, player_sub_spec
LIMIT @page_size::integer
)
-- Names are display metadata: retrieve them only after the authoritative score
-- page. Name/search filtering above still occurs before aggregation.
SELECT page.*, COALESCE(CASE WHEN @subject_kind::text = 'player' THEN
 (SELECT p.name FROM game_players p WHERE p.realm_id = page.realm_id AND p.id = page.subject_id)
 ELSE (SELECT g.name FROM guilds g WHERE g.realm_id = page.realm_id AND g.id::text = page.subject_id)
 END, page.subject_id)::text AS subject_name
FROM page ORDER BY score DESC, realm_id, subject_id, player_class, player_spec, player_sub_spec;

-- name: ListLeaderboardV2Cohorts :many
SELECT DISTINCT player_class, player_spec, player_sub_spec, metric
FROM leaderboard_player_boss_benchmarks
WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text
 AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint
 AND encounter_name = ANY(@bosses::text[])
ORDER BY player_class, player_spec, player_sub_spec, metric;

-- name: ListLeaderboardV2PageBosses :many
-- Only the returned score page is passed here, with aligned exact cohort arrays.
-- Cross the bounded page with selection to retain missing bosses as zero peaks.
WITH subjects AS (
 SELECT unnest(@realms::uuid[]) AS realm_id, unnest(@subjects::text[]) AS subject_id,
 unnest(@classes::text[]) AS player_class, unnest(@specs::text[]) AS player_spec,
 unnest(@sub_specs::text[]) AS player_sub_spec
), selected AS (
 SELECT subjects.*, unnest(@bosses::text[]) AS encounter_name FROM subjects
)
SELECT p.realm_id::uuid AS realm_id, p.subject_id::text AS subject_id, p.player_class::text AS player_class, p.player_spec::text AS player_spec, p.player_sub_spec::text AS player_sub_spec, p.encounter_name::text AS encounter_name,
 CASE WHEN b.best_metric > 0 THEN COALESCE(LEAST(100::double precision,100*s.raw_peak/b.best_metric),0) ELSE 0 END::double precision AS peak,
 COALESCE(s.raw_peak,0)::double precision AS raw_peak, COALESCE(s.peak_duration_ms,0)::bigint AS duration_ms,
 COALESCE(s.observation_count,0)::bigint AS observation_count
FROM selected p
LEFT JOIN leaderboard_player_boss_subjects s ON s.tenant_id= @tenant_id::uuid
 AND s.instance_name= @instance_name::text AND s.difficulty_name= @difficulty_name::text AND s.max_players= @max_players::smallint
 AND s.encounter_name=p.encounter_name AND s.realm_id=p.realm_id AND s.player_guid=p.subject_id
 AND s.player_class=p.player_class AND s.player_spec=p.player_spec AND s.player_sub_spec=p.player_sub_spec AND s.metric= @metric::text
LEFT JOIN leaderboard_player_boss_benchmarks b ON b.tenant_id=s.tenant_id AND b.instance_name=s.instance_name
 AND b.difficulty_name=s.difficulty_name AND b.max_players=s.max_players AND b.encounter_name=s.encounter_name
 AND b.player_class=s.player_class AND b.player_spec=s.player_spec AND b.player_sub_spec=s.player_sub_spec AND b.metric=s.metric
WHERE @subject_kind::text='player'
UNION ALL
SELECT p.realm_id::uuid AS realm_id, p.subject_id::text AS subject_id, p.player_class::text AS player_class, p.player_spec::text AS player_spec, p.player_sub_spec::text AS player_sub_spec, p.encounter_name::text AS encounter_name,
 CASE WHEN s.fastest_duration_ms > 0 AND b.best_duration_ms IS NOT NULL THEN LEAST(100::double precision,100.0*b.best_duration_ms/s.fastest_duration_ms) ELSE 0 END::double precision AS peak,
 0::double precision AS raw_peak, COALESCE(s.fastest_duration_ms,0)::bigint AS duration_ms,
 COALESCE(s.observation_count,0)::bigint AS observation_count
FROM selected p
LEFT JOIN leaderboard_guild_boss_subjects s ON s.tenant_id= @tenant_id::uuid
 AND s.instance_name= @instance_name::text AND s.difficulty_name= @difficulty_name::text AND s.max_players= @max_players::smallint
 AND s.encounter_name=p.encounter_name AND s.realm_id=p.realm_id AND s.guild_id=p.subject_id::uuid
LEFT JOIN leaderboard_guild_boss_benchmarks b ON b.tenant_id=s.tenant_id AND b.instance_name=s.instance_name
 AND b.difficulty_name=s.difficulty_name AND b.max_players=s.max_players AND b.encounter_name=s.encounter_name
WHERE @subject_kind::text='guild'
ORDER BY realm_id,subject_id,player_class,player_spec,player_sub_spec,encounter_name;
