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
 AND (@show_unknowns::boolean OR s.player_spec <> 'Unknown' OR NOT EXISTS (
  SELECT 1 FROM leaderboard_player_boss_benchmarks known
  WHERE known.tenant_id = s.tenant_id AND known.instance_name = s.instance_name
   AND known.difficulty_name = s.difficulty_name AND known.max_players = s.max_players
   AND known.encounter_name = ANY(@bosses::text[]) AND known.metric = s.metric
   AND known.player_spec <> 'Unknown'
 ))
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
SELECT page.*, COALESCE((SELECT NULLIF(r.name,'') FROM wow_server_realms r WHERE r.id=page.realm_id),'Unknown realm')::text AS realm_name,
 COALESCE(CASE WHEN @subject_kind::text = 'player' THEN
 (SELECT p.name FROM game_players p WHERE p.realm_id = page.realm_id AND p.id = page.subject_id)
 ELSE (SELECT g.name FROM guilds g WHERE g.realm_id = page.realm_id AND g.id::text = page.subject_id)
 END, page.subject_id)::text AS subject_name,
 -- Display only: Renown counts are per player, not per class, so their rows carry no
 -- player_class. Look up the character's class for coloring; never use it as identity.
 COALESCE(NULLIF(page.player_class, ''), CASE WHEN @subject_kind::text = 'player' THEN
 (SELECT p.class::text FROM game_players p WHERE p.realm_id = page.realm_id AND p.id = page.subject_id)
 END, '')::text AS subject_class,
 -- Display only: a player's current guild, empty for guild boards and guildless players.
 COALESCE(CASE WHEN @subject_kind::text = 'player' THEN
 (SELECT g.name FROM game_players p JOIN guilds g ON g.id = p.guild_id WHERE p.realm_id = page.realm_id AND p.id = page.subject_id)
 END, '')::text AS guild_name,
 -- Display only: a guild subject's page logo, empty for players and guilds without one.
 COALESCE(CASE WHEN @subject_kind::text = 'guild' THEN
 (SELECT gp.theme->>'logo_url' FROM guild_pages gp WHERE gp.guild_id = page.subject_id::uuid)
 END, '')::text AS logo_url
FROM page ORDER BY score DESC, realm_id, subject_id, player_class, player_spec, player_sub_spec;

-- name: ListLeaderboardV2Cohorts :many
SELECT DISTINCT b.player_class, b.player_spec, b.player_sub_spec, b.metric
FROM leaderboard_player_boss_benchmarks b
WHERE b.tenant_id = @tenant_id::uuid AND b.instance_name = @instance_name::text
 AND b.difficulty_name = @difficulty_name::text AND b.max_players = @max_players::smallint
 AND b.encounter_name = ANY(@bosses::text[])
 AND (@show_unknowns::boolean OR b.player_spec <> 'Unknown' OR NOT EXISTS (
  SELECT 1 FROM leaderboard_player_boss_benchmarks known
  WHERE known.tenant_id = @tenant_id::uuid AND known.instance_name = @instance_name::text
   AND known.difficulty_name = @difficulty_name::text AND known.max_players = @max_players::smallint
   AND known.encounter_name = ANY(@bosses::text[]) AND known.metric = b.metric
   AND known.player_spec <> 'Unknown'
 ))
ORDER BY b.player_class, b.player_spec, b.player_sub_spec, b.metric;

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
 CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision,100*s.raw_form/b.best_metric) ELSE 0 END::double precision AS form,
 CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision,100*s.raw_floor/b.best_metric) ELSE 0 END::double precision AS floor,
 COALESCE(s.raw_peak,0)::double precision AS raw_peak, COALESCE(s.peak_duration_ms,0)::bigint AS duration_ms,
 COALESCE(s.observation_count,0)::bigint AS observation_count,
 -- When the peak kill happened, for display: the peak encounter's end, looked up by primary key.
 pe.end_time::timestamptz AS peak_at,
 -- The peak kill's log, only while it is still listed and valid; empty otherwise.
 COALESCE(NULLIF(pli.hashed_slug, ''), pli.id::text, '')::text AS peak_log
FROM selected p
LEFT JOIN leaderboard_player_boss_subjects s ON s.tenant_id= @tenant_id::uuid
 AND s.instance_name= @instance_name::text AND s.difficulty_name= @difficulty_name::text AND s.max_players= @max_players::smallint
 AND s.encounter_name=p.encounter_name AND s.realm_id=p.realm_id AND s.player_guid=p.subject_id
 AND s.player_class=p.player_class AND s.player_spec=p.player_spec AND s.player_sub_spec=p.player_sub_spec AND s.metric= @metric::text
LEFT JOIN leaderboard_player_boss_benchmarks b ON b.tenant_id=s.tenant_id AND b.instance_name=s.instance_name
 AND b.difficulty_name=s.difficulty_name AND b.max_players=s.max_players AND b.encounter_name=s.encounter_name
 AND b.player_class=s.player_class AND b.player_spec=s.player_spec AND b.player_sub_spec=s.player_sub_spec AND b.metric=s.metric
LEFT JOIN log_instance_encounters pe ON pe.id = s.peak_encounter_id
LEFT JOIN (log_instances pli JOIN wow_log_groups plg ON plg.id = pli.log_group_id AND NOT plg.unlisted)
 ON pli.id = pe.instance_id AND pli.invalidated_at IS NULL
WHERE @subject_kind::text='player'
UNION ALL
SELECT p.realm_id::uuid AS realm_id, p.subject_id::text AS subject_id, p.player_class::text AS player_class, p.player_spec::text AS player_spec, p.player_sub_spec::text AS player_sub_spec, p.encounter_name::text AS encounter_name,
 CASE WHEN s.fastest_duration_ms > 0 AND b.best_duration_ms IS NOT NULL THEN LEAST(100::double precision,100.0*b.best_duration_ms/s.fastest_duration_ms) ELSE 0 END::double precision AS peak,
 CASE WHEN b.best_duration_ms IS NOT NULL THEN LEAST(100::double precision,100*b.best_duration_ms*s.form_mean_inverse_ms) ELSE 0 END::double precision AS form,
 CASE WHEN b.best_duration_ms IS NOT NULL THEN LEAST(100::double precision,100*b.best_duration_ms*s.floor_mean_inverse_ms) ELSE 0 END::double precision AS floor,
 0::double precision AS raw_peak, COALESCE(s.fastest_duration_ms,0)::bigint AS duration_ms,
 COALESCE(s.observation_count,0)::bigint AS observation_count,
 NULL::timestamptz AS peak_at,
 ''::text AS peak_log
FROM selected p
LEFT JOIN leaderboard_guild_boss_subjects s ON s.tenant_id= @tenant_id::uuid
 AND s.instance_name= @instance_name::text AND s.difficulty_name= @difficulty_name::text AND s.max_players= @max_players::smallint
 AND s.encounter_name=p.encounter_name AND s.realm_id=p.realm_id AND s.guild_id=p.subject_id::uuid
LEFT JOIN leaderboard_guild_boss_benchmarks b ON b.tenant_id=s.tenant_id AND b.instance_name=s.instance_name
 AND b.difficulty_name=s.difficulty_name AND b.max_players=s.max_players AND b.encounter_name=s.encounter_name
WHERE @subject_kind::text='guild'
ORDER BY realm_id,subject_id,player_class,player_spec,player_sub_spec,encounter_name;

-- name: ListLeaderboardV2PageRenown :many
-- Companion metric for the returned performance page; no cohort double-counting.
WITH page AS (SELECT DISTINCT unnest(@realms::uuid[]) AS realm_id, unnest(@subjects::text[]) AS subject_id),
awards AS (SELECT unnest(@bosses::text[]) AS encounter_name,unnest(@awards::double precision[]) AS points)
SELECT p.realm_id::uuid AS realm_id,p.subject_id::text AS subject_id,COALESCE(sum(c.kill_count*a.points),0)::double precision AS renown
FROM page p CROSS JOIN awards a
LEFT JOIN leaderboard_player_renown_counts c ON c.tenant_id = @tenant_id::uuid AND c.instance_name = @instance_name::text
 AND c.difficulty_name = @difficulty_name::text AND c.max_players = @max_players::smallint
 AND c.realm_id=p.realm_id AND c.player_guid=p.subject_id AND c.encounter_name=a.encounter_name
WHERE @subject_kind::text='player' GROUP BY p.realm_id,p.subject_id
UNION ALL
SELECT p.realm_id::uuid AS realm_id,p.subject_id::text AS subject_id,COALESCE(sum(c.kill_count*a.points),0)::double precision AS renown
FROM page p CROSS JOIN awards a
LEFT JOIN leaderboard_guild_renown_counts c ON c.tenant_id = @tenant_id::uuid AND c.instance_name = @instance_name::text
 AND c.difficulty_name = @difficulty_name::text AND c.max_players = @max_players::smallint
 AND c.realm_id=p.realm_id AND c.guild_id=p.subject_id::uuid AND c.encounter_name=a.encounter_name
WHERE @subject_kind::text='guild' GROUP BY p.realm_id,p.subject_id;

-- name: ListLeaderboardV2PlayerCompanions :many
-- Bounded page x eligible benchmark cohorts x selected bosses. Never blend specs
-- boss-by-boss: rank only complete fixed-denominator candidate aggregates.
WITH page AS (SELECT DISTINCT unnest(@realms::uuid[]) AS realm_id,unnest(@subjects::text[]) AS subject_id),
cohorts AS (SELECT DISTINCT player_class,player_spec,player_sub_spec FROM leaderboard_player_boss_benchmarks
 WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text
 AND max_players = @max_players::smallint AND metric = @metric::text AND encounter_name=ANY(@bosses::text[])
 AND (@player_class::text='' OR player_class = @player_class::text)
 AND (@player_spec::text='' OR player_spec = @player_spec::text)
 AND (NOT @filter_sub_spec::boolean OR player_sub_spec = @player_sub_spec::text)
 AND (@show_unknowns::boolean OR player_spec <> 'Unknown' OR NOT EXISTS (
  SELECT 1 FROM leaderboard_player_boss_benchmarks known
  WHERE known.tenant_id = @tenant_id::uuid AND known.instance_name = @instance_name::text
   AND known.difficulty_name = @difficulty_name::text AND known.max_players = @max_players::smallint
   AND known.metric = @metric::text AND known.encounter_name = ANY(@bosses::text[])
   AND known.player_spec <> 'Unknown'
 ))),
candidates AS (
 SELECT p.realm_id,p.subject_id,c.player_class,c.player_spec,c.player_sub_spec,
 sum(CASE WHEN b.best_metric>0 THEN LEAST(100::double precision,100*s.raw_peak/b.best_metric) ELSE 0 END)/ @denominator::integer AS peak,
 sum(CASE WHEN b.best_metric>0 THEN .3*LEAST(100::double precision,100*s.raw_peak/b.best_metric)+.5*LEAST(100::double precision,100*s.raw_form/b.best_metric)+.2*LEAST(100::double precision,100*s.raw_floor/b.best_metric) ELSE 0 END)/ @denominator::integer AS mastery
 FROM page p CROSS JOIN cohorts c CROSS JOIN unnest(@bosses::text[]) boss
 JOIN leaderboard_player_boss_subjects s ON s.tenant_id = @tenant_id::uuid AND s.instance_name = @instance_name::text
 AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint AND s.encounter_name=boss
 AND s.realm_id=p.realm_id AND s.player_guid=p.subject_id AND s.player_class=c.player_class AND s.player_spec=c.player_spec AND s.player_sub_spec=c.player_sub_spec AND s.metric = @metric::text
 JOIN leaderboard_player_boss_benchmarks b ON b.tenant_id=s.tenant_id AND b.instance_name=s.instance_name AND b.difficulty_name=s.difficulty_name AND b.max_players=s.max_players AND b.encounter_name=s.encounter_name AND b.player_class=s.player_class AND b.player_spec=s.player_spec AND b.player_sub_spec=s.player_sub_spec AND b.metric=s.metric
 GROUP BY p.realm_id,p.subject_id,c.player_class,c.player_spec,c.player_sub_spec
), ranked AS (
 SELECT *,row_number() OVER(PARTITION BY realm_id,subject_id ORDER BY peak DESC,player_class COLLATE "C",player_spec COLLATE "C",player_sub_spec COLLATE "C") AS peak_rank,
 row_number() OVER(PARTITION BY realm_id,subject_id ORDER BY mastery DESC,player_class COLLATE "C",player_spec COLLATE "C",player_sub_spec COLLATE "C") AS mastery_rank FROM candidates
)
SELECT realm_id::uuid AS realm_id,subject_id::text AS subject_id,player_class,player_spec,player_sub_spec,'peak'::text AS metric,peak::double precision AS score FROM ranked WHERE peak_rank=1
UNION ALL
SELECT realm_id::uuid AS realm_id,subject_id::text AS subject_id,player_class,player_spec,player_sub_spec,'mastery'::text AS metric,mastery::double precision AS score FROM ranked WHERE mastery_rank=1;

-- name: ListLeaderboardV2PlayerHistory :many
-- One character's canonical evidence, for the ratings education page. Observations
-- have no player-first index, so start from the player's rankings (indexed by
-- player_guid), derive each canonical run, and probe the observation primary key.
WITH runs AS MATERIALIZED (
 SELECT DISTINCT d.instance_name, d.difficulty_name, d.max_players, d.encounter_name,
        COALESCE(li.duplicate_group_id, li.id) AS run_id
 FROM encounter_dps_rankings d
 JOIN log_instances li ON li.id = d.instance_id
 WHERE d.player_guid = @player_guid::text AND d.realm_id = @realm_id::uuid AND d.encounter_id IS NOT NULL
)
SELECT o.instance_name, o.difficulty_name, o.max_players, o.encounter_name,
       o.player_class, o.player_spec, o.player_sub_spec, o.metric, o.metric_value,
       e.start_time AS killed_at,
       COALESCE(b.best_metric, 0)::double precision AS best_metric,
       COALESCE(p.display_score, 0)::smallint AS parse, (p.display_score IS NOT NULL)::boolean AS has_parse
FROM runs r
JOIN leaderboard_player_observations o ON o.tenant_id = @tenant_id::uuid
 AND o.instance_name = r.instance_name AND o.difficulty_name = r.difficulty_name AND o.max_players = r.max_players
 AND o.encounter_name = r.encounter_name AND o.run_id = r.run_id
 AND o.realm_id = @realm_id::uuid AND o.player_guid = @player_guid::text
JOIN log_instance_encounters e ON e.id = o.source_encounter_id
LEFT JOIN leaderboard_player_boss_benchmarks b ON b.tenant_id = o.tenant_id AND b.instance_name = o.instance_name
 AND b.difficulty_name = o.difficulty_name AND b.max_players = o.max_players AND b.encounter_name = o.encounter_name
 AND b.player_class = o.player_class AND b.player_spec = o.player_spec AND b.player_sub_spec = o.player_sub_spec AND b.metric = o.metric
LEFT JOIN LATERAL (
 SELECT ps.display_score FROM parse_score_results ps
 WHERE ps.tenant_id = o.tenant_id AND ps.instance_id = o.source_instance_id AND ps.player_guid = o.player_guid
   AND ps.metric = o.metric AND ps.encounter_name = o.encounter_name AND ps.status IN ('ok', 'low_confidence')
 ORDER BY ps.created_at DESC, ps.precise_score DESC
 LIMIT 1
) p ON true
ORDER BY o.instance_name, o.difficulty_name, o.max_players, o.encounter_name,
         o.player_class, o.player_spec, o.player_sub_spec, o.metric, e.start_time, o.run_id
LIMIT 5000;

-- name: ListLeaderboardV2BossLeaders :many
-- Each selected boss's #1 player for Peak, Ranked Mastery, Renown, and raw
-- performance, in one round trip for the overview's boss cards. Peak and
-- Mastery are the boss's own (denominator 1) normalized results, exactly as the
-- raid board computes per boss before averaging; performance is the best raw
-- DPS/HPS behind those results. Renown ignores performance cohort filters.
WITH boss_scores AS MATERIALIZED (
 SELECT s.encounter_name, s.realm_id, s.player_guid::text AS subject_id,
  s.player_class::text AS player_class, s.player_spec::text AS player_spec, s.player_sub_spec::text AS player_sub_spec,
  s.raw_peak,
  CASE WHEN b.best_metric > 0 THEN LEAST(100::double precision, 100 * s.raw_peak / b.best_metric) ELSE 0 END::double precision AS peak,
  CASE WHEN b.best_metric > 0 THEN
   0.30 * LEAST(100::double precision, 100 * s.raw_peak / b.best_metric)
   + 0.50 * LEAST(100::double precision, 100 * s.raw_form / b.best_metric)
   + 0.20 * LEAST(100::double precision, 100 * s.raw_floor / b.best_metric)
  ELSE 0 END::double precision AS mastery
 FROM leaderboard_player_boss_subjects s
 JOIN leaderboard_player_boss_benchmarks b ON b.tenant_id = s.tenant_id AND b.instance_name = s.instance_name AND b.difficulty_name = s.difficulty_name AND b.max_players = s.max_players AND b.encounter_name = s.encounter_name AND b.player_class = s.player_class AND b.player_spec = s.player_spec AND b.player_sub_spec = s.player_sub_spec AND b.metric = s.metric
 WHERE s.tenant_id = @tenant_id::uuid AND s.instance_name = @instance_name::text AND s.difficulty_name = @difficulty_name::text AND s.max_players = @max_players::smallint
  AND s.encounter_name = ANY(@bosses::text[]) AND s.metric = @metric::text
  AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR s.realm_id = @realm_filter::uuid)
  AND (@player_class::text = '' OR s.player_class = @player_class::text)
  AND (@player_spec::text = '' OR s.player_spec = @player_spec::text)
  AND (NOT @filter_sub_spec::boolean OR s.player_sub_spec = @player_sub_spec::text)
  AND (@show_unknowns::boolean OR s.player_spec <> 'Unknown' OR NOT EXISTS (
   SELECT 1 FROM leaderboard_player_boss_benchmarks known
   WHERE known.tenant_id = s.tenant_id AND known.instance_name = s.instance_name
    AND known.difficulty_name = s.difficulty_name AND known.max_players = s.max_players
    AND known.encounter_name = ANY(@bosses::text[]) AND known.metric = s.metric
    AND known.player_spec <> 'Unknown'
  ))
), leaders AS (
 (SELECT DISTINCT ON (encounter_name) 'peak'::text AS kind, encounter_name, realm_id, subject_id, player_class, player_spec, player_sub_spec, peak AS score, raw_peak AS raw
  FROM boss_scores ORDER BY encounter_name, peak DESC, raw_peak DESC, realm_id, subject_id, player_class, player_spec, player_sub_spec)
 UNION ALL
 (SELECT DISTINCT ON (encounter_name) 'mastery'::text, encounter_name, realm_id, subject_id, player_class, player_spec, player_sub_spec, mastery, raw_peak
  FROM boss_scores ORDER BY encounter_name, mastery DESC, realm_id, subject_id, player_class, player_spec, player_sub_spec)
 UNION ALL
 (SELECT DISTINCT ON (encounter_name) 'performance'::text, encounter_name, realm_id, subject_id, player_class, player_spec, player_sub_spec, raw_peak, raw_peak
  FROM boss_scores ORDER BY encounter_name, raw_peak DESC, realm_id, subject_id, player_class, player_spec, player_sub_spec)
 UNION ALL
 (SELECT DISTINCT ON (c.encounter_name) 'renown'::text, c.encounter_name, c.realm_id, c.player_guid::text, ''::text, ''::text, ''::text, (c.kill_count * a.points)::double precision, 0::double precision
  FROM leaderboard_player_renown_counts c
  JOIN (SELECT unnest(@bosses::text[]) AS encounter_name, unnest(@awards::double precision[]) AS points) a ON a.encounter_name = c.encounter_name
  WHERE c.tenant_id = @tenant_id::uuid AND c.instance_name = @instance_name::text AND c.difficulty_name = @difficulty_name::text AND c.max_players = @max_players::smallint
   AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR c.realm_id = @realm_filter::uuid)
   AND c.kill_count * a.points > 0
  ORDER BY c.encounter_name, c.kill_count * a.points DESC, c.realm_id, c.player_guid)
)
SELECT leaders.kind::text AS kind, leaders.encounter_name::text AS encounter_name, leaders.realm_id::uuid AS realm_id, leaders.subject_id::text AS subject_id,
 leaders.player_class::text AS player_class, leaders.player_spec::text AS player_spec, leaders.player_sub_spec::text AS player_sub_spec,
 leaders.score::double precision AS score, leaders.raw::double precision AS raw,
 COALESCE((SELECT NULLIF(r.name, '') FROM wow_server_realms r WHERE r.id = leaders.realm_id), 'Unknown realm')::text AS realm_name,
 COALESCE(gp.name, leaders.subject_id)::text AS subject_name,
 COALESCE(NULLIF(leaders.player_class, ''), gp.class::text, '')::text AS subject_class,
 COALESCE(g.name, '')::text AS guild_name
FROM leaders
LEFT JOIN game_players gp ON gp.realm_id = leaders.realm_id AND gp.id = leaders.subject_id
LEFT JOIN guilds g ON g.id = gp.guild_id
ORDER BY leaders.encounter_name, leaders.kind;
