-- One dirty key covers both windows; zero-observation keys still return two
-- rows so deletion can retract stale active scores. The quantiles and drop
-- count mirror CalculateTenantPlayerMasteryPage/GuildMasteryPage exactly.
-- name: LockDirtyMasterySubjects :many
SELECT tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
       difficulty_name, max_players, player_class, player_spec, player_sub_spec,
       performance_metric, revision
FROM rating_dirty_mastery_subjects
WHERE tenant_id = @tenant_id
ORDER BY changed_at, subject_kind, realm_id, subject_id, instance_name, encounter_name,
         difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric
LIMIT LEAST(GREATEST(@batch_size::int, 0), 16)
FOR UPDATE SKIP LOCKED;

-- name: DeleteDirtyMasterySubjectIfRevision :execrows
DELETE FROM rating_dirty_mastery_subjects
WHERE tenant_id = @tenant_id AND subject_kind = @subject_kind AND realm_id = @realm_id
  AND subject_id = @subject_id AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND revision = @revision;

-- name: ListDirtyMasteryTenants :many
SELECT DISTINCT tenant_id FROM rating_dirty_mastery_subjects
WHERE tenant_ratings_enabled(tenant_id) ORDER BY tenant_id;

-- name: CalculateLiveMasterySubject :many
WITH evidence AS MATERIALIZED (
    SELECT player.locked_parse::double precision AS score, player.killed_at, player.run_id
    FROM rating_live_player_observations player
    WHERE @subject_kind::text = 'player' AND player.tenant_id = @tenant_id
      AND player.realm_id = @realm_id AND player.player_guid = @subject_id
      AND player.instance_name = @instance_name AND player.encounter_name = @encounter_name
      AND player.difficulty_name = @difficulty_name AND player.max_players = @max_players
      AND player.player_class = @player_class AND player.player_spec = @player_spec
      AND player.player_sub_spec = @player_sub_spec AND player.performance_metric = @performance_metric
      AND player.locked_parse BETWEEN 0 AND 100 AND player.killed_at < @as_of::timestamptz
    UNION ALL
    SELECT guild.locked_parse::double precision, guild.killed_at, guild.run_id
    FROM rating_live_guild_observations guild
    WHERE @subject_kind::text = 'guild' AND guild.tenant_id = @tenant_id
      AND guild.realm_id = @realm_id AND guild.guild_id = @guild_id::uuid
      AND guild.instance_name = @instance_name AND guild.encounter_name = @encounter_name
      AND guild.difficulty_name = @difficulty_name AND guild.max_players = @max_players
      AND guild.locked_parse BETWEEN 0 AND 100 AND guild.killed_at < @as_of::timestamptz
), windows AS (
    SELECT 'all_time'::text AS window_kind, @all_time_start::timestamptz AS filter_start,
           NULL::timestamptz AS window_start, NULL::timestamptz AS window_end
    UNION ALL
    SELECT 'period'::text, @period_start::timestamptz,
           @period_start::timestamptz, @as_of::timestamptz
), ordered AS MATERIALIZED (
    SELECT w.window_kind, evidence.score,
           (row_number() OVER (PARTITION BY w.window_kind ORDER BY evidence.score, evidence.killed_at, evidence.run_id) - 1)::bigint AS position,
           count(*) OVER (PARTITION BY w.window_kind)::bigint AS eligible_kills
    FROM windows w
    JOIN evidence ON evidence.killed_at >= w.filter_start
), classified AS MATERIALIZED (
    SELECT *, CASE WHEN eligible_kills >= 5 THEN eligible_kills / 5 ELSE 0 END AS excluded_kills
    FROM ordered
), summary AS (
    SELECT window_kind, max(eligible_kills)::bigint AS eligible_kills,
           max(excluded_kills)::bigint AS excluded_kills,
           max(score)::double precision AS best,
           max(score) FILTER (WHERE position = excluded_kills + ((eligible_kills - excluded_kills - 1) / 4))::double precision AS floor_score,
           max(score) FILTER (WHERE position = excluded_kills + ((eligible_kills - excluded_kills - 1) / 2))::double precision AS form_score
    FROM classified GROUP BY window_kind
)
SELECT w.window_kind, w.window_start, w.window_end,
       COALESCE(s.eligible_kills, 0)::bigint AS eligible_kills,
       COALESCE(s.excluded_kills, 0)::bigint AS excluded_kills,
       s.best, s.floor_score, s.form_score
FROM windows w
LEFT JOIN summary s ON s.window_kind = w.window_kind
ORDER BY w.window_kind;

-- Reset the previous active scores, including both metrics and windows. Scope
-- recomputation is separate and must run before acknowledging the dirty key.
-- name: DeletePlayerLiveMasteryScores :exec
DELETE FROM player_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id AND realm_id = @realm_id
  AND player_guid = @subject_id AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND rating_metric IN ('mastery', 'ranked_mastery');

-- name: DeleteGuildLiveMasteryScores :exec
DELETE FROM guild_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id AND realm_id = @realm_id
  AND guild_id = @guild_id AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric IN ('mastery', 'ranked_mastery');

-- name: InsertPlayerLiveMasteryScore :execrows
INSERT INTO player_tenant_rating_boss_scores
    (generation_id, tenant_id, realm_id, player_guid, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, rating_metric, window_kind, window_start, window_end,
     score, best_locked_parse, form, floor_score, eligible_kills)
SELECT gen.id, gen.tenant_id, realm.id, @subject_id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best::double precision, @form::double precision,
       @floor::double precision, @eligible_kills::int
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: InsertGuildLiveMasteryScore :execrows
INSERT INTO guild_tenant_rating_boss_scores
    (generation_id, tenant_id, realm_id, guild_id, instance_name, encounter_name,
     difficulty_name, max_players, rating_metric, window_kind, window_start, window_end,
     score, best_locked_parse, form, floor_score, eligible_kills)
SELECT gen.id, gen.tenant_id, realm.id, guild.id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best::double precision, @form::double precision,
       @floor::double precision, @eligible_kills::int
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- Recompute raid scopes from all surviving boss rows in this subject/cohort.
-- Go applies the same ZG Edge slot policy as full rebuild before inserting.
-- name: DeletePlayerLiveMasteryScope :exec
DELETE FROM player_tenant_rating_scope_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id AND realm_id = @realm_id
  AND player_guid = @subject_id AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND rating_metric = @rating_metric AND window_kind = @window_kind;

-- name: DeleteGuildLiveMasteryScope :exec
DELETE FROM guild_tenant_rating_scope_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id AND realm_id = @realm_id
  AND guild_id = @guild_id AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric = @rating_metric AND window_kind = @window_kind;

-- name: InsertPlayerLiveMasteryScope :execrows
INSERT INTO player_tenant_rating_scope_scores
    (generation_id, tenant_id, realm_id, player_guid, instance_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     rating_metric, window_kind, window_start, window_end, score)
SELECT gen.id, gen.tenant_id, realm.id, @subject_id, @instance_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: InsertGuildLiveMasteryScope :execrows
INSERT INTO guild_tenant_rating_scope_scores
    (generation_id, tenant_id, realm_id, guild_id, instance_name, difficulty_name,
     max_players, rating_metric, window_kind, window_start, window_end, score)
SELECT gen.id, gen.tenant_id, realm.id, guild.id, @instance_name,
       @difficulty_name, @max_players, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- The daily expiry scan is bounded by page and by active period rows. It
-- catches missed days using each row's previous window_start; all-time rows
-- and career Renown evidence are never discarded.
-- name: ListPlayerLiveMasteryExpiryPage :many
SELECT score.realm_id, score.player_guid, score.instance_name, score.encounter_name,
       score.difficulty_name, score.max_players, score.player_class, score.player_spec,
       score.player_sub_spec, score.performance_metric
FROM player_tenant_rating_boss_scores score
JOIN rating_score_generations gen ON gen.id = score.generation_id AND gen.status = 'active'
WHERE score.tenant_id = @tenant_id AND score.rating_metric = 'mastery'
  AND score.window_kind = 'period' AND score.window_start < @period_start::timestamptz
  AND (score.realm_id, score.player_guid, score.instance_name, score.encounter_name,
       score.difficulty_name, score.max_players, score.player_class, score.player_spec,
       score.player_sub_spec, score.performance_metric) >
      (@after_realm_id::uuid, @after_player_guid::text, @after_instance_name::text,
       @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint,
       @after_player_class::text, @after_player_spec::text, @after_player_sub_spec::text,
       @after_performance_metric::text)
  AND EXISTS (SELECT 1 FROM rating_live_player_observations fact
      WHERE fact.tenant_id = score.tenant_id AND fact.realm_id = score.realm_id
        AND fact.player_guid = score.player_guid AND fact.instance_name = score.instance_name
        AND fact.encounter_name = score.encounter_name AND fact.difficulty_name = score.difficulty_name
        AND fact.max_players = score.max_players AND fact.player_class = score.player_class
        AND fact.player_spec = score.player_spec AND fact.player_sub_spec = score.player_sub_spec
        AND fact.performance_metric = score.performance_metric
        AND fact.locked_parse BETWEEN 0 AND 100
        AND fact.killed_at >= score.window_start AND fact.killed_at < @period_start::timestamptz)
ORDER BY score.realm_id, score.player_guid, score.instance_name, score.encounter_name,
         score.difficulty_name, score.max_players, score.player_class, score.player_spec,
         score.player_sub_spec, score.performance_metric
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListGuildLiveMasteryExpiryPage :many
SELECT score.realm_id, score.guild_id, score.instance_name, score.encounter_name,
       score.difficulty_name, score.max_players
FROM guild_tenant_rating_boss_scores score
JOIN rating_score_generations gen ON gen.id = score.generation_id AND gen.status = 'active'
WHERE score.tenant_id = @tenant_id AND score.rating_metric = 'mastery'
  AND score.window_kind = 'period' AND score.window_start < @period_start::timestamptz
  AND (score.realm_id, score.guild_id, score.instance_name, score.encounter_name,
       score.difficulty_name, score.max_players) >
      (@after_realm_id::uuid, @after_guild_id::uuid, @after_instance_name::text,
       @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint)
  AND EXISTS (SELECT 1 FROM rating_live_guild_observations fact
      WHERE fact.tenant_id = score.tenant_id AND fact.realm_id = score.realm_id
        AND fact.guild_id = score.guild_id AND fact.instance_name = score.instance_name
        AND fact.encounter_name = score.encounter_name AND fact.difficulty_name = score.difficulty_name
        AND fact.max_players = score.max_players AND fact.locked_parse BETWEEN 0 AND 100
        AND fact.killed_at >= score.window_start AND fact.killed_at < @period_start::timestamptz)
ORDER BY score.realm_id, score.guild_id, score.instance_name, score.encounter_name,
         score.difficulty_name, score.max_players
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: MarkDirtyMasterySubject :exec
INSERT INTO rating_dirty_mastery_subjects
    (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
VALUES (@tenant_id, @subject_kind, @realm_id, @subject_id, @instance_name, @encounter_name,
        @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec, @performance_metric)
ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
             difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
DO UPDATE SET revision = rating_dirty_mastery_subjects.revision + 1, changed_at = now();
