-- Evolving projections reuse the same fact and cohort calculations as legacy live scores.

-- name: CurrentTenantRatingPolicy :one
SELECT current_tenant_rating_policy(@tenant_id::uuid);

-- Serialize policy/config reads with tenant configuration revisions. A newly
-- created tenant need not have started any generation or checkpoint.
-- name: LockEvolvingTenantRatingRevision :one
INSERT INTO rating_config_revisions (tenant_id) VALUES (@tenant_id::uuid)
ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision
RETURNING revision;

-- name: EvolvingDeletePlayerTenantRenownBoss :exec
DELETE FROM player_tenant_rating_boss_scores_evolving AS score
WHERE score.tenant_id = @tenant_id
  AND score.realm_id = @realm_id AND score.player_guid = @player_guid
  AND score.instance_name = @instance_name AND score.encounter_name = @encounter_name
  AND score.rating_metric = 'renown' AND score.window_kind = @window_kind;

-- name: EvolvingUpsertPlayerTenantRenownBoss :execrows
INSERT INTO player_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, encounter_name,
     performance_metric, rating_metric, window_kind, window_start, window_end,
     score, eligible_kills)
SELECT @tenant_id, realm.id, @player_guid, @instance_name, @encounter_name,
       'none', 'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, @score::double precision, @eligible_kills::int
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND @eligible_kills::int > 0
ON CONFLICT (tenant_id, realm_id, player_guid, instance_name,
             encounter_name, difficulty_name, max_players, player_class,
             player_spec, player_sub_spec, performance_metric, rating_metric, window_kind)
DO UPDATE SET score = EXCLUDED.score, eligible_kills = EXCLUDED.eligible_kills,
              window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
              computed_at = now();

-- name: EvolvingDeleteGuildTenantRenownBoss :exec
DELETE FROM guild_tenant_rating_boss_scores_evolving AS score
WHERE score.tenant_id = @tenant_id
  AND score.realm_id = @realm_id AND score.guild_id = @guild_id
  AND score.instance_name = @instance_name AND score.encounter_name = @encounter_name
  AND score.rating_metric = 'renown' AND score.window_kind = @window_kind;

-- name: EvolvingUpsertGuildTenantRenownBoss :execrows
INSERT INTO guild_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, guild_id, instance_name, encounter_name,
     rating_metric, window_kind, window_start, window_end, score, eligible_kills)
SELECT @tenant_id, realm.id, guild.id, @instance_name, @encounter_name,
       'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, @score::double precision, @eligible_kills::int
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND @eligible_kills::int > 0
ON CONFLICT (tenant_id, realm_id, guild_id, instance_name,
             encounter_name, difficulty_name, max_players, rating_metric, window_kind)
DO UPDATE SET score = EXCLUDED.score, eligible_kills = EXCLUDED.eligible_kills,
              window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
              computed_at = now();

-- name: EvolvingDeletePlayerTenantRenownScope :exec
DELETE FROM player_tenant_rating_scope_scores_evolving AS scope
WHERE scope.tenant_id = @tenant_id
  AND scope.realm_id = @realm_id AND scope.player_guid = @player_guid
  AND scope.rating_metric = 'renown' AND scope.window_kind = @window_kind
  AND scope.instance_name = @instance_name;

-- name: EvolvingInsertPlayerTenantRenownScopes :exec
INSERT INTO player_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, performance_metric,
     rating_metric, window_kind, window_start, window_end, score)
SELECT @tenant_id, @realm_id, @player_guid, boss.instance_name,
       'none', 'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, sum(boss.score)::double precision
FROM player_tenant_rating_boss_scores_evolving boss
WHERE boss.tenant_id = @tenant_id
  AND boss.realm_id = @realm_id AND boss.player_guid = @player_guid
  AND boss.rating_metric = 'renown' AND boss.window_kind = @window_kind
  AND boss.instance_name = @instance_name
GROUP BY boss.instance_name;

-- name: EvolvingDeleteGuildTenantRenownScope :exec
DELETE FROM guild_tenant_rating_scope_scores_evolving AS scope
WHERE scope.tenant_id = @tenant_id
  AND scope.realm_id = @realm_id AND scope.guild_id = @guild_id
  AND scope.rating_metric = 'renown' AND scope.window_kind = @window_kind
  AND scope.instance_name = @instance_name;

-- name: EvolvingInsertGuildTenantRenownScopes :exec
INSERT INTO guild_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, guild_id, instance_name, rating_metric,
     window_kind, window_start, window_end, score)
SELECT @tenant_id, @realm_id, @guild_id, boss.instance_name,
       'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, sum(boss.score)::double precision
FROM guild_tenant_rating_boss_scores_evolving boss
WHERE boss.tenant_id = @tenant_id
  AND boss.realm_id = @realm_id AND boss.guild_id = @guild_id
  AND boss.rating_metric = 'renown' AND boss.window_kind = @window_kind
  AND boss.instance_name = @instance_name
GROUP BY boss.instance_name;

-- name: EvolvingDeletePlayerLiveMasteryScores :exec
DELETE FROM player_tenant_rating_boss_scores_evolving
WHERE tenant_id = @tenant_id AND realm_id = @realm_id
  AND player_guid = @subject_id AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND rating_metric IN ('mastery', 'ranked_mastery');

-- name: EvolvingDeleteGuildLiveMasteryScores :exec
DELETE FROM guild_tenant_rating_boss_scores_evolving
WHERE tenant_id = @tenant_id AND realm_id = @realm_id
  AND guild_id = @guild_id AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric IN ('mastery', 'ranked_mastery');

-- name: EvolvingInsertPlayerLiveMasteryScore :execrows
INSERT INTO player_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, rating_metric, window_kind, window_start, window_end,
     score, best_locked_parse, form, floor_score, eligible_kills)
SELECT @tenant_id, realm.id, @subject_id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best::double precision, @form::double precision,
       @floor::double precision, @eligible_kills::int
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: EvolvingInsertGuildLiveMasteryScore :execrows
INSERT INTO guild_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, guild_id, instance_name, encounter_name,
     difficulty_name, max_players, rating_metric, window_kind, window_start, window_end,
     score, best_locked_parse, form, floor_score, eligible_kills)
SELECT @tenant_id, realm.id, guild.id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best::double precision, @form::double precision,
       @floor::double precision, @eligible_kills::int
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- Recompute raid scopes from all surviving boss rows in this subject/cohort.
-- Go applies the same ZG Edge slot policy as full rebuild before inserting.

-- name: EvolvingDeletePlayerLiveMasteryScope :exec
DELETE FROM player_tenant_rating_scope_scores_evolving
WHERE tenant_id = @tenant_id AND realm_id = @realm_id
  AND player_guid = @subject_id AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND rating_metric = @rating_metric AND window_kind = @window_kind;

-- name: EvolvingDeleteGuildLiveMasteryScope :exec
DELETE FROM guild_tenant_rating_scope_scores_evolving
WHERE tenant_id = @tenant_id AND realm_id = @realm_id
  AND guild_id = @guild_id AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric = @rating_metric AND window_kind = @window_kind;

-- name: EvolvingInsertPlayerLiveMasteryScope :execrows
INSERT INTO player_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     rating_metric, window_kind, window_start, window_end, score)
SELECT @tenant_id, realm.id, @subject_id, @instance_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: EvolvingInsertGuildLiveMasteryScope :execrows
INSERT INTO guild_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, guild_id, instance_name, difficulty_name,
     max_players, rating_metric, window_kind, window_start, window_end, score)
SELECT @tenant_id, realm.id, guild.id, @instance_name,
       @difficulty_name, @max_players, @rating_metric, @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: EvolvingGetLivePeakCohortDenominators :one
SELECT COALESCE(MAX(rank_one_raw) FILTER (WHERE window_kind = 'all_time'), 0)::double precision AS all_time_raw,
       COALESCE(MAX(rank_one_raw) FILTER (WHERE window_kind = 'period'), 0)::double precision AS period_raw,
       (MAX(window_start) FILTER (WHERE window_kind = 'period'))::timestamptz AS period_start,
       (MAX(window_end) FILTER (WHERE window_kind = 'period'))::timestamptz AS as_of
FROM rating_peak_cohort_denominators_evolving
WHERE tenant_id = @tenant_id
  AND subject_kind = @subject_kind AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric;

-- name: EvolvingUpsertLivePeakCohortDenominator :execrows
INSERT INTO rating_peak_cohort_denominators_evolving
    (tenant_id, subject_kind, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, window_kind, window_start, window_end, rank_one_raw)
SELECT @tenant_id, @subject_kind, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, @rank_one_raw::double precision
WHERE @rank_one_raw::double precision > 0
ON CONFLICT (tenant_id, subject_kind, instance_name, encounter_name,
             difficulty_name, max_players, player_class, player_spec, player_sub_spec,
             performance_metric, window_kind)
DO UPDATE SET rank_one_raw = EXCLUDED.rank_one_raw, window_start = EXCLUDED.window_start,
              window_end = EXCLUDED.window_end, updated_at = now();

-- name: EvolvingDeleteLivePeakCohortDenominator :exec
DELETE FROM rating_peak_cohort_denominators_evolving
WHERE tenant_id = @tenant_id
  AND subject_kind = @subject_kind AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND window_kind = @window_kind;

-- A previous partial pass can be reused only while its dirty revision matches.

-- name: EvolvingGetLivePeakCohortPage :one
SELECT revision, after_realm_id, after_subject_id FROM rating_peak_cohort_pages_evolving
WHERE tenant_id = @tenant_id AND subject_kind = @subject_kind
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric;

-- name: EvolvingUpsertLivePeakCohortPage :exec
INSERT INTO rating_peak_cohort_pages_evolving
    (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     revision, after_realm_id, after_subject_id)
VALUES (@tenant_id, @subject_kind, @instance_name, @encounter_name, @difficulty_name,
        @max_players, @player_class, @player_spec, @player_sub_spec, @performance_metric,
        @revision, @after_realm_id, @after_subject_id)
ON CONFLICT (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
             max_players, player_class, player_spec, player_sub_spec, performance_metric)
DO UPDATE SET revision = EXCLUDED.revision,
              after_realm_id = EXCLUDED.after_realm_id, after_subject_id = EXCLUDED.after_subject_id;

-- Include stale old-score subjects so deleting their last observation removes
-- their displayed Peak rather than leaving an orphan. Union removes duplicates.

-- name: EvolvingListLivePeakPlayerSubjectPage :many
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
  FROM player_tenant_rating_boss_scores_evolving score
  WHERE score.tenant_id = @tenant_id
    AND score.rating_metric = 'peak' AND score.instance_name = @instance_name
    AND score.encounter_name = @encounter_name AND score.difficulty_name = @difficulty_name
    AND score.max_players = @max_players AND score.player_class = @player_class
    AND score.player_spec = @player_spec AND score.player_sub_spec = @player_sub_spec
    AND score.performance_metric = @performance_metric
    AND (score.realm_id, score.player_guid) > (@after_realm_id::uuid, @after_subject_id::text)
)
SELECT realm_id, subject_id FROM subjects
ORDER BY realm_id, subject_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 100);

-- Apply one player page with a bounded set of statements. The page subjects and
-- realm rosters are passed as JSONB so every delete/insert is set-based.

-- name: EvolvingDeleteLivePeakPlayerPage :exec
WITH subjects AS (
  SELECT (item->>'realm_id')::uuid AS realm_id, item->>'subject_id' AS subject_id
  FROM jsonb_array_elements(@subjects::jsonb) AS subject(item)
), deleted_scopes AS (
  DELETE FROM player_tenant_rating_scope_scores_evolving scope
  USING subjects subject
  WHERE scope.tenant_id = @tenant_id
    AND scope.realm_id = subject.realm_id AND scope.player_guid = subject.subject_id
    AND scope.instance_name = @instance_name AND scope.difficulty_name = @difficulty_name
    AND scope.max_players = @max_players AND scope.player_class = @player_class
    AND scope.player_spec = @player_spec AND scope.player_sub_spec = @player_sub_spec
    AND scope.performance_metric = @performance_metric AND scope.rating_metric = 'peak'
)
DELETE FROM player_tenant_rating_boss_scores_evolving score
USING subjects subject
WHERE score.tenant_id = @tenant_id
  AND score.realm_id = subject.realm_id AND score.player_guid = subject.subject_id
  AND score.instance_name = @instance_name AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name AND score.max_players = @max_players
  AND score.player_class = @player_class AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec AND score.performance_metric = @performance_metric
  AND score.rating_metric = 'peak';

-- name: EvolvingInsertLivePeakPlayerPageScores :exec
WITH subjects AS (
  SELECT (item->>'realm_id')::uuid AS realm_id, item->>'subject_id' AS subject_id
  FROM jsonb_array_elements(@subjects::jsonb) AS subject(item)
), windows AS (
  SELECT 'all_time'::text AS window_kind, NULL::timestamptz AS window_start,
         NULL::timestamptz AS window_end, @all_time_rank::double precision AS rank_one_raw
  UNION ALL
  SELECT 'period'::text, @period_start::timestamptz,
         @as_of::timestamptz, @period_rank::double precision
), best AS (
  SELECT DISTINCT ON (subject.realm_id, subject.subject_id, peak_window.window_kind)
         subject.realm_id, subject.subject_id, peak_window.window_kind,
         peak_window.window_start, peak_window.window_end, peak_window.rank_one_raw,
         live.raw_value::double precision AS best_raw,
         live.duration_secs::double precision AS best_duration_secs
  FROM subjects subject
  JOIN rating_live_player_observations live
    ON live.tenant_id = @tenant_id AND live.realm_id = subject.realm_id
   AND live.player_guid = subject.subject_id
   AND live.instance_name = @instance_name AND live.encounter_name = @encounter_name
   AND live.difficulty_name = @difficulty_name AND live.max_players = @max_players
   AND live.player_class = @player_class AND live.player_spec = @player_spec
   AND live.player_sub_spec = @player_sub_spec AND live.performance_metric = @performance_metric
  CROSS JOIN windows peak_window
  WHERE live.killed_at < @as_of::timestamptz
    AND (peak_window.window_kind = 'all_time' OR live.killed_at >= @period_start::timestamptz)
  ORDER BY subject.realm_id, subject.subject_id, peak_window.window_kind,
           live.raw_value DESC, live.killed_at
)
INSERT INTO player_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, rating_metric, window_kind, window_start, window_end,
     score, best_raw, rank_one_raw, best_duration_secs)
SELECT @tenant_id, best.realm_id, best.subject_id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, 'peak', best.window_kind, best.window_start, best.window_end,
       (100 * best.best_raw / best.rank_one_raw)::double precision,
       best.best_raw, best.rank_one_raw, best.best_duration_secs
FROM best
JOIN wow_server_realms realm ON realm.id = best.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE best.best_raw > 0 AND best.rank_one_raw > 0 AND best.best_raw <= best.rank_one_raw
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: EvolvingInsertLivePeakPlayerPageScopes :exec
WITH subjects AS (
  SELECT (item->>'realm_id')::uuid AS realm_id, item->>'subject_id' AS subject_id
  FROM jsonb_array_elements(@subjects::jsonb) AS subject(item)
), roster_slots AS (
  SELECT DISTINCT subject.realm_id,
         CASE WHEN @instance_name = 'Zul''Gurub'
                    AND encounter_name IN ('Gri''lek', 'Hazza''rah', 'Renataki', 'Wushoolay')
              THEN 'Edge of Madness' ELSE encounter_name END AS slot
  FROM (SELECT DISTINCT realm_id FROM subjects) subject
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(NULLIF(@rosters::jsonb -> subject.realm_id::text, 'null'::jsonb), '[]'::jsonb)
  ) roster(encounter_name)
), slotted_bosses AS (
  SELECT score.realm_id, score.player_guid AS subject_id, score.window_kind,
         CASE WHEN score.instance_name = 'Zul''Gurub'
                    AND score.encounter_name IN ('Gri''lek', 'Hazza''rah', 'Renataki', 'Wushoolay')
              THEN 'Edge of Madness' ELSE score.encounter_name END AS slot,
         score.encounter_name, score.score, score.best_raw, score.best_duration_secs
  FROM player_tenant_rating_boss_scores_evolving score
  JOIN subjects subject ON subject.realm_id = score.realm_id AND subject.subject_id = score.player_guid
  WHERE score.tenant_id = @tenant_id AND score.instance_name = @instance_name
    AND score.difficulty_name = @difficulty_name AND score.max_players = @max_players
    AND score.player_class = @player_class AND score.player_spec = @player_spec
    AND score.player_sub_spec = @player_sub_spec AND score.performance_metric = @performance_metric
    AND score.rating_metric = 'peak'
), chosen AS (
  SELECT DISTINCT ON (realm_id, subject_id, window_kind, slot)
         realm_id, subject_id, window_kind, slot, score, best_raw, best_duration_secs
  FROM slotted_bosses
  ORDER BY realm_id, subject_id, window_kind, slot, score DESC, best_raw DESC, encounter_name
), observed AS (
  SELECT realm_id, subject_id, window_kind,
         avg(score)::double precision AS observed_score,
         CASE WHEN bool_and(COALESCE(best_raw > 0 AND best_duration_secs > 0, false))
              THEN (sum(best_raw * best_duration_secs) / sum(best_duration_secs))::double precision
              ELSE 0::double precision END AS throughput,
         CASE WHEN bool_and(COALESCE(best_raw > 0 AND best_duration_secs > 0, false))
              THEN sum(best_duration_secs)::double precision
              ELSE 0::double precision END AS throughput_duration
  FROM chosen
  GROUP BY realm_id, subject_id, window_kind
), scope_windows AS (
  SELECT 'all_time'::text AS window_kind
  UNION ALL SELECT 'period'::text
), roster_scores AS (
  SELECT subject.realm_id, subject.subject_id, peak_window.window_kind,
         (sum(COALESCE(chosen.score, 0)) / count(*))::double precision AS roster_score
  FROM subjects subject
  CROSS JOIN scope_windows peak_window
  JOIN roster_slots roster ON roster.realm_id = subject.realm_id
  LEFT JOIN chosen ON chosen.realm_id = subject.realm_id
                  AND chosen.subject_id = subject.subject_id
                  AND chosen.window_kind = peak_window.window_kind
                  AND chosen.slot = roster.slot
  GROUP BY subject.realm_id, subject.subject_id, peak_window.window_kind
)
INSERT INTO player_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     rating_metric, window_kind, window_start, window_end, score, best_raw, best_duration_secs)
SELECT @tenant_id, observed.realm_id, observed.subject_id, @instance_name, @difficulty_name,
       @max_players, @player_class, @player_spec, @player_sub_spec, @performance_metric,
       'peak', observed.window_kind,
       CASE WHEN observed.window_kind = 'period' THEN @period_start::timestamptz END,
       CASE WHEN observed.window_kind = 'period' THEN @as_of::timestamptz END,
       COALESCE(roster_scores.roster_score, observed.observed_score),
       observed.throughput, observed.throughput_duration
FROM observed
LEFT JOIN roster_scores
  ON roster_scores.realm_id = observed.realm_id
 AND roster_scores.subject_id = observed.subject_id
 AND roster_scores.window_kind = observed.window_kind;

-- name: EvolvingListLivePeakGuildSubjectPage :many
WITH subjects AS (
  SELECT live.realm_id, live.guild_id AS subject_id
  FROM rating_live_guild_observations live
  WHERE live.tenant_id = @tenant_id AND live.guild_id IS NOT NULL
    AND live.instance_name = @instance_name AND live.encounter_name = @encounter_name
    AND live.difficulty_name = @difficulty_name AND live.max_players = @max_players
    AND (live.realm_id, live.guild_id) > (@after_realm_id::uuid, @after_subject_id::uuid)
  UNION
  SELECT score.realm_id, score.guild_id
  FROM guild_tenant_rating_boss_scores_evolving score
  WHERE score.tenant_id = @tenant_id
    AND score.rating_metric = 'peak' AND score.instance_name = @instance_name
    AND score.encounter_name = @encounter_name AND score.difficulty_name = @difficulty_name
    AND score.max_players = @max_players
    AND (score.realm_id, score.guild_id) > (@after_realm_id::uuid, @after_subject_id::uuid)
)
SELECT realm_id, subject_id FROM subjects
ORDER BY realm_id, subject_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 100);

-- These are the same best/tie-break semantics as RatingStagePlayerPeak and
-- RatingStageGuildPeak, applied only to one exact live subject.

-- name: EvolvingDeleteLivePeakPlayerScores :exec
DELETE FROM player_tenant_rating_boss_scores_evolving
WHERE tenant_id = @tenant_id
  AND realm_id = @realm_id AND player_guid = @subject_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND rating_metric = 'peak';

-- name: EvolvingDeleteLivePeakGuildScores :exec
DELETE FROM guild_tenant_rating_boss_scores_evolving
WHERE tenant_id = @tenant_id
  AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric = 'peak';

-- Raw best is retained alongside the display score so readers can use the
-- current cohort denominator even if that denominator changes later.

-- name: EvolvingInsertLivePeakPlayerScore :execrows
INSERT INTO player_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, rating_metric, window_kind, window_start, window_end,
     score, best_raw, rank_one_raw, best_duration_secs)
SELECT @tenant_id, realm.id, @subject_id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best_raw::double precision, @rank_one_raw::double precision,
       @best_duration_secs::double precision
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: EvolvingInsertLivePeakGuildScore :execrows
INSERT INTO guild_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, guild_id, instance_name, encounter_name,
     difficulty_name, max_players, rating_metric, window_kind, window_start, window_end,
     score, best_raw, rank_one_raw)
SELECT @tenant_id, realm.id, guild.id, @instance_name, @encounter_name,
       @difficulty_name, @max_players, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best_raw::double precision, @rank_one_raw::double precision
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: EvolvingDeleteLivePeakPlayerScope :exec
DELETE FROM player_tenant_rating_scope_scores_evolving
WHERE tenant_id = @tenant_id
  AND realm_id = @realm_id AND player_guid = @subject_id
  AND instance_name = @instance_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND rating_metric = 'peak'
  AND window_kind = @window_kind;

-- name: EvolvingDeleteLivePeakGuildScope :exec
DELETE FROM guild_tenant_rating_scope_scores_evolving
WHERE tenant_id = @tenant_id
  AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND rating_metric = 'peak'
  AND window_kind = @window_kind;

-- name: EvolvingInsertLivePeakPlayerScope :execrows
INSERT INTO player_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, player_guid, instance_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     rating_metric, window_kind, window_start, window_end, score, best_raw, best_duration_secs)
SELECT @tenant_id, realm.id, @subject_id, @instance_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision, @best_raw::double precision, @best_duration_secs::double precision
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: EvolvingInsertLivePeakGuildScope :execrows
INSERT INTO guild_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, guild_id, instance_name, difficulty_name,
     max_players, rating_metric, window_kind, window_start, window_end, score)
SELECT @tenant_id, realm.id, guild.id, @instance_name,
       @difficulty_name, @max_players, 'peak', @window_kind,
       sqlc.narg(window_start)::timestamptz, sqlc.narg(window_end)::timestamptz,
       @score::double precision
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE realm.id = @realm_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid);

-- Expiring even a guildless observation can change the guild denominator.
-- Keyset by cohort, not by subject; historical observations remain durable.

-- name: EvolvingListTenantPlayerRaidBosses :many
SELECT encounter_name, score, best_raw, best_duration_secs FROM player_tenant_rating_boss_scores_evolving
WHERE tenant_id = @tenant_id AND realm_id = @realm_id
  AND player_guid = @player_guid AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND rating_metric = @rating_metric AND window_kind = @window_kind
ORDER BY encounter_name LIMIT 201;

-- name: EvolvingListTenantGuildRaidBosses :many
SELECT encounter_name, score FROM guild_tenant_rating_boss_scores_evolving
WHERE tenant_id = @tenant_id AND realm_id = @realm_id
  AND guild_id = @guild_id AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric = @rating_metric AND window_kind = @window_kind
ORDER BY encounter_name LIMIT 201;
