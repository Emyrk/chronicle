-- Current-known storage for time-parse clear-time and boss-kill cohorts.
-- Each logical run is stored once per tenant and scoring version. Date windows
-- are applied at read time so late uploads, corrections, and invalidations are
-- reflected immediately.

-- name: DeleteTimeParseClearTimeMembershipSeries :exec
DELETE FROM time_parse_clear_time_memberships
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: DeleteTimeParseClearTimeMembershipsByLogGroup :exec
DELETE FROM time_parse_clear_time_memberships WHERE log_group_id = @log_group_id;

-- name: DeleteTimeParseClearTimeMembershipsByInstance :exec
DELETE FROM time_parse_clear_time_memberships WHERE instance_id = @instance_id;

-- name: RefreshTimeParseClearTimeMembershipsForLogGroup :one
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
    SELECT
        COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id,
        representative.run_id,
        speedrun.instance_id,
        instance.log_group_id,
        speedrun.instance_name,
        instance.difficulty_name,
        instance.max_players,
        speedrun.ranked_duration_ms::bigint AS duration_ms,
        speedrun.start_time::timestamptz AS start_time
    FROM representative_instances representative
    JOIN log_instances instance ON instance.id = representative.id
    JOIN instance_speedruns speedrun ON speedrun.instance_id = representative.id
    JOIN wow_server_realms realm ON realm.id = instance.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    WHERE speedrun.qualified = true
      AND speedrun.ranked_duration_ms > 0
),
upserted AS (
    INSERT INTO time_parse_clear_time_memberships (
        tenant_id, policy_version, query_version, run_id,
        instance_id, log_group_id, instance_name,
        difficulty_name, max_players, duration_ms, start_time
    )
    SELECT
        member.tenant_id, @policy_version, @query_version, member.run_id,
        member.instance_id, member.log_group_id, member.instance_name,
        member.difficulty_name, member.max_players, member.duration_ms, member.start_time
    FROM current_members member
    ON CONFLICT (tenant_id, policy_version, query_version, run_id) DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        log_group_id = EXCLUDED.log_group_id,
        instance_name = EXCLUDED.instance_name,
        difficulty_name = EXCLUDED.difficulty_name,
        max_players = EXCLUDED.max_players,
        duration_ms = EXCLUDED.duration_ms,
        start_time = EXCLUDED.start_time
    RETURNING 1
),
deleted AS (
    DELETE FROM time_parse_clear_time_memberships membership
    WHERE membership.policy_version = @policy_version
      AND membership.query_version = @query_version
      AND membership.run_id IN (SELECT run_id FROM affected_runs)
      AND NOT EXISTS (
          SELECT 1 FROM current_members member
          WHERE member.tenant_id = membership.tenant_id
            AND member.run_id = membership.run_id
      )
    RETURNING 1
)
SELECT
    (SELECT COUNT(*) FROM upserted)::bigint AS upserted_count,
    (SELECT COUNT(*) FROM deleted)::bigint AS deleted_count;

-- name: GetTimeParseClearTimeMembershipCohort :many
SELECT membership.duration_ms
FROM time_parse_clear_time_memberships membership
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.start_time < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.start_time >= @window_start)
  AND (@exclude_run_id::uuid IS NULL OR membership.run_id <> @exclude_run_id)
  AND membership.instance_name = @instance_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players;

-- name: ListTimeParseClearTimeMemberships :many
SELECT * FROM time_parse_clear_time_memberships
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version
ORDER BY run_id;

-- name: DeleteTimeParseBossKillMembershipSeries :exec
DELETE FROM time_parse_boss_kill_memberships
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: DeleteTimeParseBossKillMembershipsByLogGroup :exec
DELETE FROM time_parse_boss_kill_memberships WHERE log_group_id = @log_group_id;

-- name: DeleteTimeParseBossKillMembershipsByInstance :exec
DELETE FROM time_parse_boss_kill_memberships WHERE instance_id = @instance_id;

-- name: RefreshTimeParseBossKillMembershipsForLogGroup :one
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
    SELECT DISTINCT ON (representative.run_id, encounter.name)
        COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id,
        representative.run_id,
        encounter.name AS encounter_name,
        instance.id AS instance_id,
        instance.log_group_id,
        speedrun.instance_name,
        instance.difficulty_name,
        instance.max_players,
        (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint AS duration_ms,
        encounter.end_time AS killed_at
    FROM representative_instances representative
    JOIN log_instances instance ON instance.id = representative.id
    JOIN instance_speedruns speedrun ON speedrun.instance_id = representative.id
    JOIN log_instance_encounters encounter ON encounter.instance_id = representative.id
    JOIN wow_server_realms realm ON realm.id = instance.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    WHERE encounter.boss = true
      AND encounter.kill_type = 'clean'
      AND encounter.end_time > encounter.start_time
      AND (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint > 0
    ORDER BY representative.run_id, encounter.name,
        (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint ASC,
        encounter.end_time ASC
),
upserted AS (
    INSERT INTO time_parse_boss_kill_memberships (
        tenant_id, policy_version, query_version, run_id, encounter_name,
        instance_id, log_group_id, instance_name, difficulty_name, max_players,
        duration_ms, killed_at
    )
    SELECT
        member.tenant_id, @policy_version, @query_version, member.run_id, member.encounter_name,
        member.instance_id, member.log_group_id, member.instance_name,
        member.difficulty_name, member.max_players, member.duration_ms, member.killed_at
    FROM current_members member
    ON CONFLICT (tenant_id, policy_version, query_version, run_id, encounter_name) DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        log_group_id = EXCLUDED.log_group_id,
        instance_name = EXCLUDED.instance_name,
        difficulty_name = EXCLUDED.difficulty_name,
        max_players = EXCLUDED.max_players,
        duration_ms = EXCLUDED.duration_ms,
        killed_at = EXCLUDED.killed_at
    RETURNING 1
),
deleted AS (
    DELETE FROM time_parse_boss_kill_memberships membership
    WHERE membership.policy_version = @policy_version
      AND membership.query_version = @query_version
      AND membership.run_id IN (SELECT run_id FROM affected_runs)
      AND NOT EXISTS (
          SELECT 1 FROM current_members member
          WHERE member.tenant_id = membership.tenant_id
            AND member.run_id = membership.run_id
            AND member.encounter_name = membership.encounter_name
      )
    RETURNING 1
)
SELECT
    (SELECT COUNT(*) FROM upserted)::bigint AS upserted_count,
    (SELECT COUNT(*) FROM deleted)::bigint AS deleted_count;

-- name: GetTimeParseBossKillMembershipCohort :many
SELECT membership.duration_ms
FROM time_parse_boss_kill_memberships membership
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND (@exclude_run_id::uuid IS NULL OR membership.run_id <> @exclude_run_id)
  AND membership.instance_name = @instance_name
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players;

-- name: ListTimeParseBossKillMemberships :many
SELECT * FROM time_parse_boss_kill_memberships
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version
ORDER BY run_id, encounter_name;

-- name: ListTimeParseBossKillCohortBuckets :many
SELECT
    membership.instance_name,
    membership.encounter_name,
    membership.difficulty_name,
    membership.max_players,
    COUNT(*)::bigint AS sample_size
FROM time_parse_boss_kill_memberships membership
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
GROUP BY membership.instance_name, membership.encounter_name,
         membership.difficulty_name, membership.max_players
ORDER BY membership.instance_name, membership.encounter_name,
         membership.difficulty_name, membership.max_players;

-- name: ListTimeParseClearTimeCohortBuckets :many
SELECT
    membership.instance_name,
    membership.difficulty_name,
    membership.max_players,
    COUNT(*)::bigint AS sample_size
FROM time_parse_clear_time_memberships membership
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.start_time < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.start_time >= @window_start)
GROUP BY membership.instance_name, membership.difficulty_name, membership.max_players
ORDER BY membership.instance_name, membership.difficulty_name, membership.max_players;

-- name: GetTimeParseBossKillCohortEntries :many
SELECT
    membership.instance_id,
    membership.duration_ms,
    membership.killed_at,
    instance.hashed_slug AS log_hashed_slug,
    guild.id AS guild_id,
    guild.name AS guild_name
FROM time_parse_boss_kill_memberships membership
LEFT JOIN log_instances instance ON instance.id = membership.instance_id
LEFT JOIN guilds guild ON guild.id = instance.guild_id
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.killed_at >= @window_start)
  AND membership.instance_name = @instance_name
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
ORDER BY membership.duration_ms, membership.killed_at;

-- name: GetTimeParseClearTimeCohortEntries :many
SELECT
    membership.instance_id,
    membership.duration_ms,
    membership.start_time AS killed_at,
    instance.hashed_slug AS log_hashed_slug,
    guild.id AS guild_id,
    guild.name AS guild_name
FROM time_parse_clear_time_memberships membership
LEFT JOIN log_instances instance ON instance.id = membership.instance_id
LEFT JOIN guilds guild ON guild.id = instance.guild_id
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.start_time < @cutoff
  AND (@window_start::timestamptz IS NULL OR membership.start_time >= @window_start)
  AND membership.instance_name = @instance_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
ORDER BY membership.duration_ms, membership.start_time;
