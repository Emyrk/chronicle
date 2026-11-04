-- A cohort dirty key covers all subjects and both windows. Lock it before
-- computing the tenant-wide best; new observations increment its revision.
-- name: LockDirtyPeakCohorts :many
SELECT tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
       max_players, player_class, player_spec, player_sub_spec, performance_metric, revision
FROM rating_dirty_peak_cohorts WHERE tenant_id = @tenant_id
ORDER BY changed_at, subject_kind, instance_name, encounter_name, difficulty_name,
         max_players, player_class, player_spec, player_sub_spec, performance_metric
LIMIT LEAST(GREATEST(@batch_size::int, 0), 16)
FOR UPDATE SKIP LOCKED;

-- name: ListDirtyPeakTenants :many
SELECT DISTINCT tenant_id FROM rating_dirty_peak_cohorts ORDER BY tenant_id;

-- name: DeleteDirtyPeakCohortIfRevision :execrows
DELETE FROM rating_dirty_peak_cohorts
WHERE tenant_id = @tenant_id AND subject_kind = @subject_kind
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND revision = @revision;

-- Guildless observations count toward guild rank one. The player and guild
-- cohorts are tenant-wide (not partitioned by realm or visible UI filters).
-- name: CalculateLivePeakCohortDenominators :one
WITH player AS (
    SELECT COALESCE(MAX(p.raw_value), 0)::double precision AS all_time,
           COALESCE(MAX(p.raw_value) FILTER (WHERE p.killed_at >= @period_start::timestamptz), 0)::double precision AS period
    FROM rating_live_player_observations p
    WHERE @subject_kind::text = 'player' AND p.tenant_id = @tenant_id
      AND p.instance_name = @instance_name AND p.encounter_name = @encounter_name
      AND p.difficulty_name = @difficulty_name AND p.max_players = @max_players
      AND p.player_class = @player_class AND p.player_spec = @player_spec
      AND p.player_sub_spec = @player_sub_spec AND p.performance_metric = @performance_metric
      AND p.killed_at < @as_of::timestamptz
), guild AS (
    SELECT COALESCE(MIN(g.raw_duration_ms), 0)::double precision AS all_time,
           COALESCE(MIN(g.raw_duration_ms) FILTER (WHERE g.killed_at >= @period_start::timestamptz), 0)::double precision AS period
    FROM rating_live_guild_observations g
    WHERE @subject_kind::text = 'guild' AND g.tenant_id = @tenant_id
      AND g.instance_name = @instance_name AND g.encounter_name = @encounter_name
      AND g.difficulty_name = @difficulty_name AND g.max_players = @max_players
      AND g.killed_at < @as_of::timestamptz
)
SELECT player.all_time AS player_all_time, player.period AS player_period,
       guild.all_time AS guild_all_time, guild.period AS guild_period
FROM player CROSS JOIN guild;

-- Reuse a denominator for later pages of the same revision and generation;
-- avoid rescanning a large tenant-wide cohort once per 16 subjects. Missing
-- rows (including an empty period) fall back to fresh aggregation.
-- name: GetLivePeakCohortDenominators :one
SELECT COALESCE(MAX(rank_one_raw) FILTER (WHERE window_kind = 'all_time'), 0)::double precision AS all_time_raw,
       COALESCE(MAX(rank_one_raw) FILTER (WHERE window_kind = 'period'), 0)::double precision AS period_raw,
       (MAX(window_start) FILTER (WHERE window_kind = 'period'))::timestamptz AS period_start,
       (MAX(window_end) FILTER (WHERE window_kind = 'period'))::timestamptz AS as_of
FROM rating_peak_cohort_denominators
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND subject_kind = @subject_kind AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric;

-- name: UpsertLivePeakCohortDenominator :execrows
INSERT INTO rating_peak_cohort_denominators
    (generation_id, tenant_id, subject_kind, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, window_kind, window_start, window_end, rank_one_raw)
SELECT gen.id, gen.tenant_id, @subject_kind, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, @rank_one_raw::double precision
FROM rating_score_generations gen
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id
  AND gen.status = 'active' AND @rank_one_raw::double precision > 0
ON CONFLICT (generation_id, tenant_id, subject_kind, instance_name, encounter_name,
             difficulty_name, max_players, player_class, player_spec, player_sub_spec,
             performance_metric, window_kind)
DO UPDATE SET rank_one_raw = EXCLUDED.rank_one_raw, window_start = EXCLUDED.window_start,
              window_end = EXCLUDED.window_end, updated_at = now();

-- name: DeleteLivePeakCohortDenominator :exec
DELETE FROM rating_peak_cohort_denominators
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND subject_kind = @subject_kind AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND window_kind = @window_kind;

-- A previous partial pass can be reused only while its dirty revision matches.
-- name: GetLivePeakCohortPage :one
SELECT revision, generation_id, after_realm_id, after_subject_id FROM rating_peak_cohort_pages
WHERE tenant_id = @tenant_id AND subject_kind = @subject_kind
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric;

-- name: UpsertLivePeakCohortPage :exec
INSERT INTO rating_peak_cohort_pages
    (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     revision, generation_id, after_realm_id, after_subject_id)
VALUES (@tenant_id, @subject_kind, @instance_name, @encounter_name, @difficulty_name,
        @max_players, @player_class, @player_spec, @player_sub_spec, @performance_metric,
        @revision, @generation_id, @after_realm_id, @after_subject_id)
ON CONFLICT (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
             max_players, player_class, player_spec, player_sub_spec, performance_metric)
DO UPDATE SET revision = EXCLUDED.revision, generation_id = EXCLUDED.generation_id,
              after_realm_id = EXCLUDED.after_realm_id, after_subject_id = EXCLUDED.after_subject_id;

-- Include stale old-score subjects so deleting their last observation removes
-- their displayed Peak rather than leaving an orphan. Union removes duplicates.
-- name: ListLivePeakPlayerSubjectPage :many
WITH subjects AS (
  SELECT live.realm_id, live.player_guid AS subject_id
  FROM rating_live_player_observations live
  WHERE live.tenant_id = @tenant_id AND live.instance_name = @instance_name
    AND live.encounter_name = @encounter_name AND live.difficulty_name = @difficulty_name
    AND live.max_players = @max_players AND live.player_class = @player_class
    AND live.player_spec = @player_spec AND live.player_sub_spec = @player_sub_spec
    AND live.performance_metric = @performance_metric
    AND (live.realm_id, live.player_guid) > (@after_realm_id::uuid, @after_subject_id::text)
  UNION
  SELECT score.realm_id, score.player_guid
  FROM player_tenant_rating_boss_scores score
  WHERE score.generation_id = @generation_id AND score.tenant_id = @tenant_id
    AND score.rating_metric = 'peak' AND score.instance_name = @instance_name
    AND score.encounter_name = @encounter_name AND score.difficulty_name = @difficulty_name
    AND score.max_players = @max_players AND score.player_class = @player_class
    AND score.player_spec = @player_spec AND score.player_sub_spec = @player_sub_spec
    AND score.performance_metric = @performance_metric
    AND (score.realm_id, score.player_guid) > (@after_realm_id::uuid, @after_subject_id::text)
)
SELECT realm_id, subject_id FROM subjects
ORDER BY realm_id, subject_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 100);

-- name: ListLivePeakGuildSubjectPage :many
WITH subjects AS (
  SELECT live.realm_id, live.guild_id AS subject_id
  FROM rating_live_guild_observations live
  WHERE live.tenant_id = @tenant_id AND live.guild_id IS NOT NULL
    AND live.instance_name = @instance_name AND live.encounter_name = @encounter_name
    AND live.difficulty_name = @difficulty_name AND live.max_players = @max_players
    AND (live.realm_id, live.guild_id) > (@after_realm_id::uuid, @after_subject_id::uuid)
  UNION
  SELECT score.realm_id, score.guild_id
  FROM guild_tenant_rating_boss_scores score
  WHERE score.generation_id = @generation_id AND score.tenant_id = @tenant_id
    AND score.rating_metric = 'peak' AND score.instance_name = @instance_name
    AND score.encounter_name = @encounter_name AND score.difficulty_name = @difficulty_name
    AND score.max_players = @max_players
    AND (score.realm_id, score.guild_id) > (@after_realm_id::uuid, @after_subject_id::uuid)
)
SELECT realm_id, subject_id FROM subjects
ORDER BY realm_id, subject_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 100);

-- These are the same best/tie-break semantics as RatingStagePlayerPeak and
-- RatingStageGuildPeak, applied only to one exact live subject.
-- name: CalculateLivePeakPlayerBest :one
SELECT COALESCE(MAX(raw_value), 0)::double precision AS all_time_raw,
       COALESCE(MAX(raw_value) FILTER (WHERE killed_at >= @period_start::timestamptz), 0)::double precision AS period_raw,
       COALESCE((array_agg(duration_secs ORDER BY raw_value DESC, killed_at))[1], 0)::double precision AS all_time_duration_secs,
       COALESCE((array_agg(duration_secs ORDER BY raw_value DESC, killed_at)
           FILTER (WHERE killed_at >= @period_start::timestamptz))[1], 0)::double precision AS period_duration_secs
FROM rating_live_player_observations
WHERE tenant_id = @tenant_id AND realm_id = @realm_id AND player_guid = @subject_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND killed_at < @as_of::timestamptz;

-- name: CalculateLivePeakGuildBest :one
SELECT COALESCE(MIN(raw_duration_ms), 0)::double precision AS all_time_raw,
       COALESCE(MIN(raw_duration_ms) FILTER (WHERE killed_at >= @period_start::timestamptz), 0)::double precision AS period_raw
FROM rating_live_guild_observations
WHERE tenant_id = @tenant_id AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND killed_at < @as_of::timestamptz;

-- name: DeleteLivePeakPlayerScores :exec
DELETE FROM player_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND realm_id = @realm_id AND player_guid = @subject_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND rating_metric = 'peak';

-- name: DeleteLivePeakGuildScores :exec
DELETE FROM guild_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric = 'peak';

-- Raw best is retained alongside the display score so readers can use the
-- current cohort denominator even if that denominator changes later.
-- name: InsertLivePeakPlayerScore :execrows
INSERT INTO player_tenant_rating_boss_scores
    (generation_id, tenant_id, realm_id, player_guid, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, rating_metric, window_kind, window_start, window_end,
     score, best_raw, rank_one_raw, best_duration_secs)
SELECT gen.id, gen.tenant_id, realm.id, @subject_id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best_raw::double precision, @rank_one_raw::double precision,
       @best_duration_secs::double precision
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: InsertLivePeakGuildScore :execrows
INSERT INTO guild_tenant_rating_boss_scores
    (generation_id, tenant_id, realm_id, guild_id, instance_name, encounter_name,
     difficulty_name, max_players, rating_metric, window_kind, window_start, window_end,
     score, best_raw, rank_one_raw)
SELECT gen.id, gen.tenant_id, realm.id, guild.id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best_raw::double precision, @rank_one_raw::double precision
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: DeleteLivePeakPlayerScope :exec
DELETE FROM player_tenant_rating_scope_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND realm_id = @realm_id AND player_guid = @subject_id
  AND instance_name = @instance_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND rating_metric = 'peak'
  AND window_kind = @window_kind;

-- name: DeleteLivePeakGuildScope :exec
DELETE FROM guild_tenant_rating_scope_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND rating_metric = 'peak'
  AND window_kind = @window_kind;

-- name: InsertLivePeakPlayerScope :execrows
INSERT INTO player_tenant_rating_scope_scores
    (generation_id, tenant_id, realm_id, player_guid, instance_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     rating_metric, window_kind, window_start, window_end, score, best_raw, best_duration_secs)
SELECT gen.id, gen.tenant_id, realm.id, @subject_id, @instance_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best_raw::double precision, @best_duration_secs::double precision
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: InsertLivePeakGuildScope :execrows
INSERT INTO guild_tenant_rating_scope_scores
    (generation_id, tenant_id, realm_id, guild_id, instance_name, difficulty_name,
     max_players, rating_metric, window_kind, window_start, window_end, score)
SELECT gen.id, gen.tenant_id, realm.id, guild.id, @instance_name,
       @difficulty_name, @max_players, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- Expiring even a guildless observation can change the guild denominator.
-- Keyset by cohort, not by subject; historical observations remain durable.
-- name: ListPeakCohortExpiryPage :many
SELECT denominator.subject_kind, denominator.instance_name, denominator.encounter_name,
       denominator.difficulty_name, denominator.max_players, denominator.player_class,
       denominator.player_spec, denominator.player_sub_spec, denominator.performance_metric
FROM rating_peak_cohort_denominators denominator
JOIN rating_score_generations generation ON generation.id = denominator.generation_id
  AND generation.tenant_id = denominator.tenant_id AND generation.status = 'active'
WHERE denominator.tenant_id = @tenant_id AND denominator.window_kind = 'period'
  AND denominator.window_start < @period_start::timestamptz
  AND (denominator.subject_kind, denominator.instance_name, denominator.encounter_name,
       denominator.difficulty_name, denominator.max_players, denominator.player_class,
       denominator.player_spec, denominator.player_sub_spec, denominator.performance_metric) >
      (@after_subject_kind::text, @after_instance_name::text, @after_encounter_name::text,
       @after_difficulty_name::text, @after_max_players::smallint, @after_player_class::text,
       @after_player_spec::text, @after_player_sub_spec::text, @after_performance_metric::text)
  AND ((denominator.subject_kind = 'player' AND EXISTS (
      SELECT 1 FROM rating_live_player_observations fact
      WHERE fact.tenant_id = denominator.tenant_id
        AND fact.instance_name = denominator.instance_name
        AND fact.encounter_name = denominator.encounter_name
        AND fact.difficulty_name = denominator.difficulty_name
        AND fact.max_players = denominator.max_players
        AND fact.player_class = denominator.player_class
        AND fact.player_spec = denominator.player_spec
        AND fact.player_sub_spec = denominator.player_sub_spec
        AND fact.performance_metric = denominator.performance_metric
        AND fact.killed_at >= denominator.window_start
        AND fact.killed_at < @period_start::timestamptz
  )) OR (denominator.subject_kind = 'guild' AND EXISTS (
      SELECT 1 FROM rating_live_guild_observations fact
      WHERE fact.tenant_id = denominator.tenant_id
        AND fact.instance_name = denominator.instance_name
        AND fact.encounter_name = denominator.encounter_name
        AND fact.difficulty_name = denominator.difficulty_name
        AND fact.max_players = denominator.max_players
        AND fact.killed_at >= denominator.window_start
        AND fact.killed_at < @period_start::timestamptz
  )))
ORDER BY denominator.subject_kind, denominator.instance_name, denominator.encounter_name,
         denominator.difficulty_name, denominator.max_players, denominator.player_class,
         denominator.player_spec, denominator.player_sub_spec, denominator.performance_metric
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: MarkDirtyPeakCohort :exec
INSERT INTO rating_dirty_peak_cohorts
    (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric)
VALUES (@tenant_id, @subject_kind, @instance_name, @encounter_name, @difficulty_name,
        @max_players, @player_class, @player_spec, @player_sub_spec, @performance_metric)
ON CONFLICT (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
             max_players, player_class, player_spec, player_sub_spec, performance_metric)
DO UPDATE SET revision = rating_dirty_peak_cohorts.revision + 1, changed_at = now();
