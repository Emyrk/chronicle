-- Bounded, deterministic keyset scan for an operator-initiated historical
-- Renown evidence backfill. Never run a whole-history scan in a migration.
-- name: ListRenownBackfillRunIDs :many
SELECT rr.run_id
FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND rr.run_id > @after_run_id
ORDER BY rr.run_id
LIMIT @batch_size;

-- name: BackfillRenownFactsForRun :execrows
INSERT INTO renown_kill_facts (
    realm_id, player_guid, run_id, instance_name, encounter_name, killed_at
)
SELECT DISTINCT ON (ranking.player_guid, ranking.encounter_name)
    rr.realm_id, ranking.player_guid, rr.run_id,
    ranking.instance_name, ranking.encounter_name, ranking.killed_at
FROM ranking_runs rr
JOIN log_instances instance ON instance.id = rr.representative_instance_id
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
JOIN encounter_dps_rankings ranking ON ranking.instance_id = instance.id
WHERE rr.run_id = @run_id
  AND instance.invalidated_at IS NULL
  AND ranking.encounter_id IS NOT NULL
  AND ranking.duration_secs > 0
ORDER BY ranking.player_guid, ranking.encounter_name, ranking.killed_at DESC, ranking.id
ON CONFLICT (realm_id, player_guid, run_id, encounter_name) DO NOTHING;

-- name: BackfillRenownFactsForSource :execrows
-- Preserve canonical attendance even when a log is deleted before the
-- asynchronous ranking_runs refresh has persisted its representative.
INSERT INTO renown_kill_facts (
    realm_id, player_guid, run_id, instance_name, encounter_name, killed_at
)
SELECT DISTINCT ON (ranking.player_guid, ranking.encounter_name)
    @realm_id, ranking.player_guid, @run_id,
    ranking.instance_name, ranking.encounter_name, ranking.killed_at
FROM log_instances instance
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
JOIN encounter_dps_rankings ranking ON ranking.instance_id = instance.id
WHERE instance.id = @representative_instance_id
  AND instance.realm_id = @realm_id
  AND instance.invalidated_at IS NULL
  AND ranking.encounter_id IS NOT NULL
  AND ranking.duration_secs > 0
ORDER BY ranking.player_guid, ranking.encounter_name, ranking.killed_at DESC, ranking.id
ON CONFLICT (realm_id, player_guid, run_id, encounter_name) DO NOTHING;

-- name: InsertRenownKillFact :execrows
INSERT INTO renown_kill_facts (
    realm_id, player_guid, run_id, instance_name, encounter_name, killed_at
) VALUES (
    @realm_id, @player_guid, @run_id, @instance_name, @encounter_name, @killed_at
)
ON CONFLICT (realm_id, player_guid, run_id, encounter_name) DO NOTHING;

-- name: RatingObservationsForRun :many
-- Per-boss canonical raw metric and its newest eligible locked parse for the
-- requested DPS or HPS metric. has_locked_parse distinguishes missing parses
-- from zero scores, so raw Peak need not invent a Mastery observation.
SELECT
    rr.realm_id,
    rr.run_id,
    ranking.player_guid,
    ranking.instance_name,
    ranking.encounter_name,
    ranking.difficulty_name,
    ranking.max_players,
    ranking.player_class,
    ranking.player_spec,
    ranking.player_sub_spec,
    ranking.killed_at,
    @metric::text AS performance_metric,
    (CASE WHEN @metric::text = 'hps' THEN ranking.hps ELSE ranking.dps END)::double precision AS raw_value,
    (locked.precise_score IS NOT NULL)::boolean AS has_locked_parse,
    COALESCE(locked.precise_score, 0)::double precision AS locked_parse
FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN log_instances representative ON representative.id = rr.representative_instance_id
JOIN wow_log_groups log_group ON log_group.id = representative.log_group_id AND NOT log_group.unlisted
JOIN encounter_dps_rankings ranking ON ranking.instance_id = representative.id
LEFT JOIN LATERAL (
    SELECT psr.precise_score
    FROM parse_score_results psr
    JOIN log_instances scored_instance ON scored_instance.id = psr.instance_id
    JOIN wow_log_groups scored_group ON scored_group.id = scored_instance.log_group_id AND NOT scored_group.unlisted
    WHERE psr.tenant_id = @tenant_id
      AND psr.run_id = rr.run_id
      AND psr.encounter_name = ranking.encounter_name
      AND psr.player_guid = ranking.player_guid
      AND psr.instance_name = ranking.instance_name
      AND psr.difficulty_name = ranking.difficulty_name
      AND psr.max_players = ranking.max_players
      AND psr.player_class = ranking.player_class
      AND psr.player_spec = ranking.player_spec
      AND psr.player_sub_spec = ranking.player_sub_spec
      AND psr.metric = @metric
      AND psr.status IN ('ok', 'low_confidence')
    ORDER BY psr.created_at DESC, psr.precise_score DESC, psr.id
    LIMIT 1
) locked ON true
WHERE rr.run_id = @run_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND representative.invalidated_at IS NULL
  AND ranking.encounter_id IS NOT NULL
  AND ranking.duration_secs > 0
  AND @metric::text IN ('dps', 'hps')
  AND (CASE WHEN @metric::text = 'hps' THEN ranking.hps ELSE ranking.dps END) > 0
ORDER BY ranking.player_guid, ranking.encounter_name;

-- name: ListRenownFactsByCharacter :many
SELECT id, realm_id, player_guid, run_id, instance_name, encounter_name, killed_at
FROM renown_kill_facts
WHERE realm_id = @realm_id AND player_guid = @player_guid
ORDER BY killed_at, id;

-- name: InsertRatingScoreGeneration :one
INSERT INTO rating_score_generations (tenant_id, policy_version, as_of)
VALUES (@tenant_id, @policy_version, @as_of)
RETURNING *;

-- name: RetireActiveRatingScoreGeneration :exec
UPDATE rating_score_generations
SET status = 'retired'
WHERE tenant_id = @tenant_id AND status = 'active';

-- name: ActivateRatingScoreGeneration :execrows
UPDATE rating_score_generations
SET status = 'active'
WHERE id = @generation_id AND tenant_id = @tenant_id AND status = 'building';

-- name: InsertRatingBossScore :exec
INSERT INTO rating_boss_scores (
    generation_id, tenant_id, realm_id, group_id, player_guid, instance_name, encounter_name,
    difficulty_name, max_players, player_class, player_spec, player_sub_spec,
    performance_metric, rating_metric, window_kind, window_start, window_end,
    score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills
) VALUES (
    @generation_id, @tenant_id, @realm_id, @group_id, @player_guid, @instance_name, @encounter_name,
    @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
    @performance_metric, @rating_metric, @window_kind, @window_start, @window_end,
    @score, @best_raw, @rank_one_raw, @best_locked_parse, @form, @floor_score, @eligible_kills
);

-- name: ListActiveBossRatingScores :many
SELECT score.*
FROM rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
WHERE score.tenant_id = @tenant_id
  AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.player_class = @player_class
  AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
  AND score.performance_metric = @performance_metric
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT @limit_count;
