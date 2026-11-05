-- Caller holds the tenant projection advisory lock before checking and resetting.
-- A finished cursor can still have a live River job, so check both sources.
-- name: RatingPolicyScanInFlight :one
SELECT EXISTS (SELECT 1 FROM rating_policy_scan_progress
               WHERE tenant_id = @tenant_id::uuid AND NOT completed)
    OR EXISTS (SELECT 1 FROM river_job
               WHERE kind = 'rating-policy-scan'
                 AND args->>'tenant_id' = (@tenant_id::uuid)::text
                 AND state IN ('available', 'pending', 'retryable', 'running', 'scheduled')) AS in_flight;

-- Operator explicitly resets progress after a policy migration; never run this at startup.
-- name: ResetRatingPolicyScan :exec
INSERT INTO rating_policy_scan_progress (tenant_id, stage)
SELECT @tenant_id::uuid, stage FROM unnest(ARRAY['runs','renown','mastery','peak','player_scope','guild_scope']::text[]) stage
ON CONFLICT (tenant_id, stage) DO UPDATE SET after_key = NULL, completed = false, updated_at = now();

-- name: LockRatingPolicyScanProgress :one
SELECT stage, after_key, completed FROM rating_policy_scan_progress
WHERE tenant_id = @tenant_id AND NOT completed
ORDER BY array_position(ARRAY['runs','renown','mastery','peak','player_scope','guild_scope']::text[], stage)
LIMIT 1 FOR UPDATE;

-- name: ListRatingPolicyScanTenants :many
SELECT DISTINCT tenant_id FROM rating_policy_scan_progress
WHERE NOT completed AND tenant_ratings_enabled(tenant_id) ORDER BY tenant_id;

-- name: CompleteRatingPolicyScanStage :execrows
UPDATE rating_policy_scan_progress SET completed = true, updated_at = now()
WHERE tenant_id = @tenant_id AND stage = @stage AND NOT completed;

-- name: AdvanceRatingPolicyScanStage :execrows
UPDATE rating_policy_scan_progress SET after_key = @after_key::jsonb, updated_at = now()
WHERE tenant_id = @tenant_id AND stage = @stage AND NOT completed;

-- The run pass replays canonical history after a boss becomes newly eligible.
-- name: MarkPolicyScanRunPage :one
WITH page AS MATERIALIZED (
 SELECT rr.run_id FROM ranking_runs rr
 JOIN wow_server_realms realm ON realm.id = rr.realm_id
 JOIN wow_servers server ON server.id = realm.server_id
 WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
 AND (@after_key::jsonb IS NULL OR rr.run_id > (@after_key::jsonb->>0)::uuid)
 ORDER BY rr.run_id LIMIT 100
), dirty AS (
 INSERT INTO rating_dirty_observation_runs (tenant_id, run_id)
 SELECT @tenant_id::uuid, run_id FROM page
 ON CONFLICT (tenant_id, run_id) DO UPDATE SET revision = rating_dirty_observation_runs.revision + 1, changed_at = now()
 RETURNING 1
)
SELECT (SELECT jsonb_build_array(run_id) FROM page ORDER BY run_id DESC LIMIT 1) AS next_key,
 (SELECT count(*)::int FROM page) AS page_size, (SELECT count(*)::int FROM dirty) AS marked;

-- name: MarkPolicyScanRenownPage :one
WITH sources AS (
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name FROM (SELECT 'player' AS subject_kind, realm_id, player_guid AS subject_id, instance_name, encounter_name FROM renown_kill_facts WHERE realm_id IN (SELECT realm.id FROM wow_server_realms realm JOIN wow_servers server ON server.id = realm.server_id WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid))) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name FROM (SELECT 'guild' AS subject_kind, realm_id, guild_id::text AS subject_id, instance_name, encounter_name FROM guild_renown_kill_facts WHERE guild_renown_kill_facts.tenant_id = @tenant_id AND tenant_id = @tenant_id) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name FROM (SELECT 'player' AS subject_kind, realm_id, player_guid AS subject_id, instance_name, encounter_name FROM player_tenant_rating_boss_scores_evolving WHERE player_tenant_rating_boss_scores_evolving.tenant_id = @tenant_id AND rating_metric = 'renown') candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name FROM (SELECT 'guild' AS subject_kind, realm_id, guild_id::text AS subject_id, instance_name, encounter_name FROM guild_tenant_rating_boss_scores_evolving WHERE guild_tenant_rating_boss_scores_evolving.tenant_id = @tenant_id AND rating_metric = 'renown') candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name LIMIT 100)
), page AS MATERIALIZED (
 SELECT DISTINCT subject_kind, realm_id, subject_id, instance_name, encounter_name FROM sources
 WHERE @after_key::jsonb IS NULL OR (subject_kind, realm_id, subject_id, instance_name, encounter_name) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text)
 ORDER BY subject_kind, realm_id, subject_id, instance_name, encounter_name LIMIT 100
), dirty AS (
 INSERT INTO rating_dirty_renown_subjects (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
 SELECT @tenant_id::uuid, subject_kind, realm_id, subject_id, instance_name, encounter_name FROM page
 ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name) DO UPDATE SET revision = rating_dirty_renown_subjects.revision + 1, changed_at = now()
 RETURNING 1
)
SELECT (SELECT jsonb_build_array(subject_kind, realm_id, subject_id, instance_name, encounter_name) FROM page ORDER BY subject_kind DESC, realm_id DESC, subject_id DESC, instance_name DESC, encounter_name DESC LIMIT 1) AS next_key,
 (SELECT count(*)::int FROM page) AS page_size, (SELECT count(*)::int FROM dirty) AS marked;

-- name: MarkPolicyScanMasteryPage :one
WITH sources AS (
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT 'player' AS subject_kind, realm_id, player_guid AS subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM rating_live_player_observations WHERE rating_live_player_observations.tenant_id = @tenant_id) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::smallint, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT 'guild' AS subject_kind, realm_id, guild_id::text AS subject_id, instance_name, encounter_name, difficulty_name, max_players, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, 'none'::text AS performance_metric FROM rating_live_guild_observations WHERE rating_live_guild_observations.tenant_id = @tenant_id AND guild_id IS NOT NULL) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::smallint, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT 'player' AS subject_kind, realm_id, player_guid AS subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM player_tenant_rating_boss_scores_evolving WHERE player_tenant_rating_boss_scores_evolving.tenant_id = @tenant_id AND rating_metric IN ('mastery','ranked_mastery')) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::smallint, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT 'guild' AS subject_kind, realm_id, guild_id::text AS subject_id, instance_name, encounter_name, difficulty_name, max_players, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, 'none'::text AS performance_metric FROM guild_tenant_rating_boss_scores_evolving WHERE guild_tenant_rating_boss_scores_evolving.tenant_id = @tenant_id AND rating_metric IN ('mastery','ranked_mastery')) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::smallint, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text)
 ORDER BY candidate.subject_kind, candidate.realm_id, candidate.subject_id, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
), page AS MATERIALIZED (
 SELECT DISTINCT subject_kind, realm_id, subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM sources
 WHERE @after_key::jsonb IS NULL OR (subject_kind, realm_id, subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::smallint, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text)
 ORDER BY subject_kind, realm_id, subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric LIMIT 100
), dirty AS (
 INSERT INTO rating_dirty_mastery_subjects (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
 SELECT @tenant_id::uuid, subject_kind, realm_id, subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM page
 ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric) DO UPDATE SET revision = rating_dirty_mastery_subjects.revision + 1, changed_at = now()
 RETURNING 1
)
SELECT (SELECT jsonb_build_array(subject_kind, realm_id, subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric) FROM page ORDER BY subject_kind DESC, realm_id DESC, subject_id DESC, instance_name DESC, encounter_name DESC, difficulty_name DESC, max_players DESC, player_class DESC, player_spec DESC, player_sub_spec DESC, performance_metric DESC LIMIT 1) AS next_key,
 (SELECT count(*)::int FROM page) AS page_size, (SELECT count(*)::int FROM dirty) AS marked;

-- name: MarkPolicyScanPeakPage :one
WITH sources AS (
 (SELECT candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM (SELECT 'player' AS subject_kind, realm_id, player_guid AS subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM rating_live_player_observations WHERE rating_live_player_observations.tenant_id = @tenant_id) source) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text)
 ORDER BY candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM (SELECT 'guild' AS subject_kind, realm_id, guild_id::text AS subject_id, instance_name, encounter_name, difficulty_name, max_players, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, 'none'::text AS performance_metric FROM rating_live_guild_observations WHERE rating_live_guild_observations.tenant_id = @tenant_id) source) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text)
 ORDER BY candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM (SELECT 'player' AS subject_kind, realm_id, player_guid AS subject_id, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM player_tenant_rating_boss_scores_evolving WHERE player_tenant_rating_boss_scores_evolving.tenant_id = @tenant_id AND rating_metric = 'peak') source) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text)
 ORDER BY candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM (SELECT 'guild' AS subject_kind, realm_id, guild_id::text AS subject_id, instance_name, encounter_name, difficulty_name, max_players, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, 'none'::text AS performance_metric FROM guild_tenant_rating_boss_scores_evolving WHERE guild_tenant_rating_boss_scores_evolving.tenant_id = @tenant_id AND rating_metric = 'peak') source) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text)
 ORDER BY candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
 UNION ALL
 (SELECT candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric FROM (SELECT subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM rating_peak_cohort_denominators_evolving WHERE rating_peak_cohort_denominators_evolving.tenant_id = @tenant_id) candidate
 WHERE @after_key::jsonb IS NULL OR (candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text)
 ORDER BY candidate.subject_kind, candidate.instance_name, candidate.encounter_name, candidate.difficulty_name, candidate.max_players, candidate.player_class, candidate.player_spec, candidate.player_sub_spec, candidate.performance_metric LIMIT 100)
), page AS MATERIALIZED (
 SELECT DISTINCT subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM sources
 WHERE @after_key::jsonb IS NULL OR (subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text)
 ORDER BY subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric LIMIT 100
), dirty AS (
 INSERT INTO rating_dirty_peak_cohorts (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
 SELECT @tenant_id::uuid, subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric FROM page
 ON CONFLICT (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric) DO UPDATE SET revision = rating_dirty_peak_cohorts.revision + 1, changed_at = now()
 RETURNING 1
)
SELECT (SELECT jsonb_build_array(subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric) FROM page ORDER BY subject_kind DESC, instance_name DESC, encounter_name DESC, difficulty_name DESC, max_players DESC, player_class DESC, player_spec DESC, player_sub_spec DESC, performance_metric DESC LIMIT 1) AS next_key,
 (SELECT count(*)::int FROM page) AS page_size, (SELECT count(*)::int FROM dirty) AS marked;
-- Scan scope-only historical projection rows, including removed raids.
-- A scope has no source boss identity; remove it only when no boss score
-- can contribute to that exact subject/metric/window scope.
-- name: CleanPolicyScanPlayerScopePage :one
WITH page AS MATERIALIZED (
 SELECT realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind FROM player_tenant_rating_scope_scores_evolving
 WHERE player_tenant_rating_scope_scores_evolving.tenant_id = @tenant_id AND (@after_key::jsonb IS NULL OR (realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind) > ((@after_key::jsonb->>0)::uuid, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text))
 ORDER BY realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind LIMIT 100
), removed AS (
 DELETE FROM player_tenant_rating_scope_scores_evolving scope USING page
 WHERE scope.tenant_id = @tenant_id AND scope.realm_id = page.realm_id AND scope.player_guid = page.player_guid AND scope.instance_name = page.instance_name AND scope.difficulty_name = page.difficulty_name AND scope.max_players = page.max_players AND scope.player_class = page.player_class AND scope.player_spec = page.player_spec AND scope.player_sub_spec = page.player_sub_spec AND scope.performance_metric = page.performance_metric AND scope.rating_metric = page.rating_metric AND scope.window_kind = page.window_kind
 AND NOT EXISTS (SELECT 1 FROM player_tenant_rating_boss_scores_evolving boss WHERE boss.tenant_id = scope.tenant_id AND boss.realm_id = scope.realm_id AND boss.player_guid = scope.player_guid AND boss.instance_name = scope.instance_name AND boss.difficulty_name = scope.difficulty_name AND boss.max_players = scope.max_players AND boss.player_class = scope.player_class AND boss.player_spec = scope.player_spec AND boss.player_sub_spec = scope.player_sub_spec AND boss.performance_metric = scope.performance_metric AND boss.rating_metric = scope.rating_metric AND boss.window_kind = scope.window_kind)
 RETURNING 1
)
SELECT (SELECT jsonb_build_array(realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind) FROM page ORDER BY realm_id DESC, player_guid DESC, instance_name DESC, difficulty_name DESC, max_players DESC, player_class DESC, player_spec DESC, player_sub_spec DESC, performance_metric DESC, rating_metric DESC, window_kind DESC LIMIT 1) AS next_key,
 (SELECT count(*)::int FROM page) AS page_size, (SELECT count(*)::int FROM removed) AS removed;

-- Scan scope-only historical projection rows, including removed raids.
-- A scope has no source boss identity; remove it only when no boss score
-- can contribute to that exact subject/metric/window scope.
-- name: CleanPolicyScanGuildScopePage :one
WITH page AS MATERIALIZED (
 SELECT realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind FROM guild_tenant_rating_scope_scores_evolving
 WHERE guild_tenant_rating_scope_scores_evolving.tenant_id = @tenant_id AND (@after_key::jsonb IS NULL OR (realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind) > ((@after_key::jsonb->>0)::uuid, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text))
 ORDER BY realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind LIMIT 100
), removed AS (
 DELETE FROM guild_tenant_rating_scope_scores_evolving scope USING page
 WHERE scope.tenant_id = @tenant_id AND scope.realm_id = page.realm_id AND scope.guild_id = page.guild_id AND scope.instance_name = page.instance_name AND scope.difficulty_name = page.difficulty_name AND scope.max_players = page.max_players AND scope.rating_metric = page.rating_metric AND scope.window_kind = page.window_kind
 AND NOT EXISTS (SELECT 1 FROM guild_tenant_rating_boss_scores_evolving boss WHERE boss.tenant_id = scope.tenant_id AND boss.realm_id = scope.realm_id AND boss.guild_id = scope.guild_id AND boss.instance_name = scope.instance_name AND boss.difficulty_name = scope.difficulty_name AND boss.max_players = scope.max_players AND boss.rating_metric = scope.rating_metric AND boss.window_kind = scope.window_kind)
 RETURNING 1
)
SELECT (SELECT jsonb_build_array(realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind) FROM page ORDER BY realm_id DESC, guild_id DESC, instance_name DESC, difficulty_name DESC, max_players DESC, rating_metric DESC, window_kind DESC LIMIT 1) AS next_key,
 (SELECT count(*)::int FROM page) AS page_size, (SELECT count(*)::int FROM removed) AS removed;
