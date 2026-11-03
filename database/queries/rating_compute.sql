-- name: AcquireRatingRebuildConfigLock :exec
SELECT pg_advisory_xact_lock(1131453276, 1);

-- name: ListRatingRunsForGroup :many
SELECT rr.run_id
FROM ranking_runs rr
JOIN rating_realm_group_memberships membership ON membership.realm_id = rr.realm_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AND grp.id = @group_id
  AND rr.run_id > @after_run_id
ORDER BY rr.run_id
LIMIT @batch_size;

-- name: RatingObservationsForRuns :many
-- Set-based source extraction for one bounded page of canonical runs.
SELECT rr.realm_id, rr.run_id, ranking.player_guid, ranking.instance_name,
       ranking.encounter_name, ranking.difficulty_name, ranking.max_players,
       ranking.player_class, ranking.player_spec, ranking.player_sub_spec,
       ranking.killed_at, @metric::text AS performance_metric,
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
    WHERE psr.tenant_id = @tenant_id AND psr.run_id = rr.run_id
      AND psr.encounter_name = ranking.encounter_name AND psr.player_guid = ranking.player_guid
      AND psr.instance_name = ranking.instance_name AND psr.difficulty_name = ranking.difficulty_name
      AND psr.max_players = ranking.max_players AND psr.player_class = ranking.player_class
      AND psr.player_spec = ranking.player_spec AND psr.player_sub_spec = ranking.player_sub_spec
      AND psr.metric = @metric AND psr.status IN ('ok', 'low_confidence')
    ORDER BY psr.created_at DESC, psr.precise_score DESC, psr.id
    LIMIT 1
) locked ON true
WHERE rr.run_id = ANY(@run_ids::uuid[]) AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND representative.invalidated_at IS NULL
  AND ranking.encounter_id IS NOT NULL AND ranking.duration_secs > 0
  AND @metric::text IN ('dps', 'hps')
  AND (CASE WHEN @metric::text = 'hps' THEN ranking.hps ELSE ranking.dps END) > 0
ORDER BY rr.run_id, ranking.player_guid, ranking.encounter_name;

-- name: ListRatingScoreTenants :many
SELECT DISTINCT server.tenant_id
FROM rating_group_policies policy
JOIN rating_realm_groups grp ON grp.id = policy.group_id
JOIN wow_servers server ON server.id = grp.server_id
ORDER BY server.tenant_id NULLS FIRST;

-- name: ListGroupRatingBossScores :many
SELECT score.*
FROM rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id AND generation.status = 'active'
JOIN rating_realm_group_memberships membership ON membership.realm_id = score.realm_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id AND score.group_id = grp.id
JOIN wow_servers server ON server.id = grp.server_id
WHERE score.tenant_id = @tenant_id AND generation.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AND grp.id = @group_id
  AND score.rating_metric = @rating_metric AND score.window_kind = @window_kind
  AND score.performance_metric = @performance_metric
  AND score.player_class = @player_class AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
ORDER BY score.instance_name, score.encounter_name, score.score DESC, score.realm_id, score.player_guid
LIMIT @limit_count;

-- name: DeleteRetiredRatingGeneration :execrows
DELETE FROM rating_score_generations generation
WHERE generation.id IN (
    SELECT candidate.id FROM rating_score_generations candidate
    WHERE candidate.tenant_id = @tenant_id AND candidate.status = 'retired'
    ORDER BY candidate.created_at, candidate.id LIMIT 1
);
