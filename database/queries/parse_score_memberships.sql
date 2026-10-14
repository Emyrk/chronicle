-- Compact current-known membership for DPS/HPS parse cohorts.

-- name: DeleteParseScoreMembershipsByLogGroup :exec
DELETE FROM parse_score_memberships WHERE log_group_id = @log_group_id;

-- name: DeleteParseScoreMembershipsByInstance :exec
DELETE FROM parse_score_memberships WHERE instance_id = @instance_id;

-- name: RefreshParseScoreMembershipsForLogGroup :one
WITH affected_runs AS MATERIALIZED (
    SELECT DISTINCT COALESCE(instance.duplicate_group_id, instance.id) AS run_id
    FROM log_instances instance
    WHERE instance.log_group_id = @log_group_id
),
representative_instances AS MATERIALIZED (
    SELECT DISTINCT ON (COALESCE(instance.duplicate_group_id, instance.id))
        instance.id,
        COALESCE(instance.duplicate_group_id, instance.id) AS run_id
    FROM log_instances instance
    JOIN affected_runs affected
      ON affected.run_id = COALESCE(instance.duplicate_group_id, instance.id)
    WHERE instance.invalidated_at IS NULL
    ORDER BY COALESCE(instance.duplicate_group_id, instance.id),
        (SELECT COUNT(DISTINCT coverage.encounter_name)
         FROM encounter_dps_rankings coverage
         WHERE coverage.instance_id = instance.id
           AND coverage.encounter_id IS NOT NULL) DESC,
        (instance.id = instance.duplicate_group_id) DESC NULLS LAST,
        instance.start_time ASC,
        instance.id ASC
),
current_members AS MATERIALIZED (
    SELECT DISTINCT ON (representative.run_id, ranking.encounter_name, ranking.player_guid)
        COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id,
        representative.run_id,
        ranking.encounter_name,
        ranking.player_guid,
        ranking.instance_id,
        instance.log_group_id,
        ranking.instance_name,
        ranking.difficulty_name,
        ranking.max_players,
        ranking.player_class,
        ranking.player_spec,
        ranking.player_sub_spec,
        ranking.killed_at,
        ranking.dps,
        ranking.hps
    FROM representative_instances representative
    JOIN log_instances instance ON instance.id = representative.id
    JOIN encounter_dps_rankings ranking ON ranking.instance_id = representative.id
    JOIN wow_server_realms realm ON realm.id = instance.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    WHERE ranking.encounter_id IS NOT NULL
      AND (ranking.dps > 0 OR ranking.hps > 0)
      AND ranking.duration_secs > 0
      AND lower(btrim(ranking.player_class)) NOT IN ('', 'unknown')
    ORDER BY representative.run_id, ranking.encounter_name, ranking.player_guid,
             ranking.dps DESC, ranking.hps DESC
),
upserted AS (
    INSERT INTO parse_score_memberships (
        tenant_id, policy_version, query_version, run_id, encounter_name, player_guid,
        instance_id, log_group_id, instance_name, difficulty_name, max_players,
        player_class, player_spec, player_sub_spec, killed_at, dps, hps
    )
    SELECT
        member.tenant_id, @policy_version, @query_version, member.run_id,
        member.encounter_name, member.player_guid, member.instance_id,
        member.log_group_id, member.instance_name, member.difficulty_name,
        member.max_players, member.player_class, member.player_spec,
        member.player_sub_spec, member.killed_at, member.dps, member.hps
    FROM current_members member
    ON CONFLICT (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid)
    DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        log_group_id = EXCLUDED.log_group_id,
        instance_name = EXCLUDED.instance_name,
        difficulty_name = EXCLUDED.difficulty_name,
        max_players = EXCLUDED.max_players,
        player_class = EXCLUDED.player_class,
        player_spec = EXCLUDED.player_spec,
        player_sub_spec = EXCLUDED.player_sub_spec,
        killed_at = EXCLUDED.killed_at,
        dps = EXCLUDED.dps,
        hps = EXCLUDED.hps
    RETURNING 1
),
deleted AS (
    DELETE FROM parse_score_memberships membership
    WHERE membership.policy_version = @policy_version
      AND membership.query_version = @query_version
      AND membership.run_id IN (SELECT run_id FROM affected_runs)
      AND NOT EXISTS (
          SELECT 1
          FROM current_members member
          WHERE member.tenant_id = membership.tenant_id
            AND member.run_id = membership.run_id
            AND member.encounter_name = membership.encounter_name
            AND member.player_guid = membership.player_guid
      )
    RETURNING 1
)
SELECT
    (SELECT COUNT(*) FROM upserted)::bigint AS upserted_count,
    (SELECT COUNT(*) FROM deleted)::bigint AS deleted_count;

-- name: GetParseScoreMembershipCohort :many
SELECT CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END::double precision AS metric_value
FROM parse_score_memberships membership
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND membership.run_id <> @exclude_run_id
  AND membership.instance_name = @instance_name
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
  AND membership.player_class = @player_class
  AND (@cohort_mode::text <> 'spec' OR (
      membership.player_spec = @player_spec
      AND membership.player_sub_spec = @player_sub_spec
      AND lower(btrim(membership.player_spec)) NOT IN ('', 'unknown')
  ))
  AND CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END > 0;

-- name: ListParseScoreMemberships :many
SELECT *
FROM parse_score_memberships
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version
ORDER BY run_id, encounter_name, player_guid;
