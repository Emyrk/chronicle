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
    JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.private
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
        instance_id, log_group_id, difficulty_name, max_players,
        player_class, player_spec, player_sub_spec, killed_at, dps, hps
    )
    SELECT
        member.tenant_id, @policy_version, @query_version, member.run_id,
        member.encounter_name, member.player_guid, member.instance_id,
        member.log_group_id, member.difficulty_name,
        member.max_players, member.player_class, member.player_spec,
        member.player_sub_spec, member.killed_at, member.dps, member.hps
    FROM current_members member
    ON CONFLICT (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid)
    DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        log_group_id = EXCLUDED.log_group_id,
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
JOIN wow_log_groups log_group ON log_group.id = membership.log_group_id AND NOT log_group.private
WHERE (
      (@tenant_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid AND membership.tenant_id = @tenant_id)
      OR
      (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid AND (
          membership.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
          OR EXISTS (SELECT 1 FROM tenants tenant WHERE tenant.id = membership.tenant_id AND tenant.include_in_all)
      ))
  )
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND membership.run_id <> @exclude_run_id
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

-- name: ListParseScoreCohortBuckets :many
SELECT
    membership.encounter_name,
    membership.difficulty_name,
    membership.max_players,
    membership.player_class,
    CASE WHEN @cohort_mode::text = 'spec' THEN membership.player_spec ELSE '' END::text AS player_spec,
    CASE WHEN @cohort_mode::text = 'spec' THEN membership.player_sub_spec ELSE '' END::text AS player_sub_spec,
    COUNT(*)::bigint AS sample_size
FROM parse_score_memberships membership
JOIN wow_log_groups log_group ON log_group.id = membership.log_group_id AND NOT log_group.private
WHERE (
      (@tenant_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid AND membership.tenant_id = @tenant_id)
      OR
      (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid AND (
          membership.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
          OR EXISTS (SELECT 1 FROM tenants tenant WHERE tenant.id = membership.tenant_id AND tenant.include_in_all)
      ))
  )
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END > 0
  AND (@cohort_mode::text <> 'spec' OR lower(btrim(membership.player_spec)) NOT IN ('', 'unknown'))
GROUP BY membership.encounter_name, membership.difficulty_name, membership.max_players,
         membership.player_class,
         CASE WHEN @cohort_mode::text = 'spec' THEN membership.player_spec ELSE '' END,
         CASE WHEN @cohort_mode::text = 'spec' THEN membership.player_sub_spec ELSE '' END
ORDER BY membership.encounter_name, membership.player_class, player_spec, player_sub_spec,
         membership.difficulty_name, membership.max_players;

-- name: GetParseScoreCohortEntries :many
SELECT
    membership.run_id,
    membership.instance_id,
    membership.player_guid,
    COALESCE(player.player_name, '')::text AS player_name,
    CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END::double precision AS metric_value,
    membership.killed_at,
    instance.hashed_slug AS log_hashed_slug
FROM parse_score_memberships membership
JOIN log_instances instance ON instance.id = membership.instance_id
JOIN wow_log_groups log_group ON log_group.id = membership.log_group_id AND NOT log_group.private
LEFT JOIN LATERAL (
    SELECT candidate.player_name
    FROM (
        SELECT instance_player.name::text AS player_name, 0 AS source_order
        FROM log_instance_players instance_player
        WHERE instance_player.instance_id = membership.instance_id
          AND instance_player.unit_guid::text = membership.player_guid
        UNION ALL
        SELECT ranking.player_name::text AS player_name, 1 AS source_order
        FROM encounter_dps_rankings ranking
        WHERE ranking.instance_id = membership.instance_id
          AND ranking.encounter_name = membership.encounter_name
          AND ranking.player_guid = membership.player_guid
    ) candidate
    ORDER BY candidate.source_order, candidate.player_name
    LIMIT 1
) player ON true
WHERE (
      (@tenant_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid AND membership.tenant_id = @tenant_id)
      OR
      (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid AND (
          membership.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
          OR EXISTS (SELECT 1 FROM tenants tenant WHERE tenant.id = membership.tenant_id AND tenant.include_in_all)
      ))
  )
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
  AND membership.player_class = @player_class
  AND (@cohort_mode::text <> 'spec' OR (
      membership.player_spec = @player_spec
      AND membership.player_sub_spec = @player_sub_spec
      AND lower(btrim(membership.player_spec)) NOT IN ('', 'unknown')
  ))
  AND CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END > 0
ORDER BY metric_value DESC, membership.killed_at, membership.id;

-- name: ListParseScoreSpreadValues :many
-- Metric values for every exact DPS/HPS cohort on the given encounters, used
-- to summarize parse spreads without fetching per-player names. Empty
-- player_class/player_spec match every class/spec.
SELECT
    membership.encounter_name,
    membership.difficulty_name,
    membership.max_players,
    membership.player_class,
    CASE WHEN @cohort_mode::text = 'spec' THEN membership.player_spec ELSE '' END::text AS player_spec,
    CASE WHEN @cohort_mode::text = 'spec' THEN membership.player_sub_spec ELSE '' END::text AS player_sub_spec,
    membership.run_id,
    CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END::double precision AS metric_value
FROM parse_score_memberships membership
JOIN wow_log_groups log_group ON log_group.id = membership.log_group_id AND NOT log_group.private
-- tenant_ids is resolved by the caller (the default tenant also sees
-- include_in_all tenants) so it is a plain index condition; an OR across
-- tenant rules, or an array built in SQL, leaves the planner scanning every
-- membership row instead of seeking by encounter.
WHERE membership.tenant_id = ANY(@tenant_ids::uuid[])
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND membership.encounter_name = ANY(@encounter_names::text[])
  AND (@player_class::text = '' OR membership.player_class = @player_class)
  AND (@cohort_mode::text <> 'spec' OR (
      lower(btrim(membership.player_spec)) NOT IN ('', 'unknown')
      AND (@player_spec::text = '' OR membership.player_spec = @player_spec)
  ))
  AND CASE WHEN @metric::text = 'hps' THEN membership.hps ELSE membership.dps END > 0;

-- name: ListParseScoreMemberships :many
SELECT membership.*
FROM parse_score_memberships membership
JOIN wow_log_groups log_group ON log_group.id = membership.log_group_id AND NOT log_group.private
WHERE membership.tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version
ORDER BY run_id, encounter_name, player_guid;
