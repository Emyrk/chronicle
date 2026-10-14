-- Event-date-backed storage for time-parse boss-kill cohorts.
-- Each logical member is stored once and snapshot lookback windows are applied
-- at read time. Later uploads and corrections intentionally affect old parses.

-- name: DeleteTimeParseBossKillMembershipSeries :exec
DELETE FROM time_parse_boss_kill_memberships
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: ListPublishedTimeParseSnapshotsForMembershipBackfill :many
SELECT *
FROM time_parse_snapshots
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND status = 'published'
ORDER BY cutoff ASC;

-- name: DeleteTimeParseBossKillMembershipsByLogGroup :exec
DELETE FROM time_parse_boss_kill_memberships
WHERE log_group_id = @log_group_id;

-- name: DeleteTimeParseBossKillMembershipsByInstance :exec
DELETE FROM time_parse_boss_kill_memberships
WHERE instance_id = @instance_id;

-- name: RefreshTimeParseBossKillMembershipsForLogGroup :one
-- Run after a successful parse or invalidation change. Recompute every duplicate
-- run group touched by this log so lifecycle refreshes use the same representative
-- selection as snapshot publication.
WITH series AS MATERIALIZED (
    SELECT DISTINCT tenant_id, policy_version, query_version
    FROM time_parse_snapshots
    WHERE status = 'published'
),
affected_runs AS MATERIALIZED (
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
        tenant_id, policy_version, query_version,
        run_id, encounter_name,
        instance_id, log_group_id, instance_name,
        difficulty_name, max_players,
        duration_ms, killed_at
    )
    SELECT
        series.tenant_id, series.policy_version, series.query_version,
        member.run_id, member.encounter_name,
        member.instance_id, member.log_group_id, member.instance_name,
        member.difficulty_name, member.max_players,
        member.duration_ms, member.killed_at
    FROM series
    CROSS JOIN current_members member
    ON CONFLICT (
        tenant_id, policy_version, query_version, run_id, encounter_name
    ) DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        log_group_id = EXCLUDED.log_group_id,
        instance_name = EXCLUDED.instance_name,
        difficulty_name = EXCLUDED.difficulty_name,
        max_players = EXCLUDED.max_players,
        duration_ms = EXCLUDED.duration_ms,
        killed_at = EXCLUDED.killed_at
    RETURNING tenant_id, policy_version, query_version, run_id, encounter_name
),
deleted AS (
    DELETE FROM time_parse_boss_kill_memberships membership
    WHERE membership.run_id IN (SELECT run_id FROM affected_runs)
      AND NOT EXISTS (
          SELECT 1
          FROM current_members member
          WHERE member.run_id = membership.run_id
            AND member.encounter_name = membership.encounter_name
      )
    RETURNING 1
)
SELECT
    (SELECT COUNT(*) FROM upserted)::bigint AS upserted_count,
    (SELECT COUNT(*) FROM deleted)::bigint AS deleted_count;

-- name: UpsertTimeParseBossKillMemberships :exec
-- Routine snapshot publication writes current window members directly into the
-- compact store. Missing rows may be temporary during a reparse and are removed
-- only by lifecycle operations.
WITH snapshot AS (
    SELECT
        time_parse_snapshots.tenant_id,
        time_parse_snapshots.policy_version,
        time_parse_snapshots.query_version,
        time_parse_snapshots.cutoff,
        time_parse_snapshots.window_start
    FROM time_parse_snapshots
    WHERE time_parse_snapshots.id = @snapshot_id
),
representative_instances AS (
    SELECT DISTINCT ON (COALESCE(instance.duplicate_group_id, instance.id))
        instance.id,
        COALESCE(instance.duplicate_group_id, instance.id) AS run_id
    FROM log_instances instance
    WHERE instance.invalidated_at IS NULL
    ORDER BY COALESCE(instance.duplicate_group_id, instance.id),
        -- Prefer the upload with the broadest boss-ranking coverage. The group
        -- anchor is the first upload, but it may be truncated before the final boss.
        (SELECT COUNT(DISTINCT coverage.encounter_name)
         FROM encounter_dps_rankings coverage
         WHERE coverage.instance_id = instance.id
           AND coverage.encounter_id IS NOT NULL) DESC,
        (instance.id = instance.duplicate_group_id) DESC NULLS LAST,
        instance.start_time ASC,
        instance.id ASC
),
current_members AS (
    SELECT DISTINCT ON (representative.run_id, encounter.name)
        representative.run_id,
        encounter.name AS encounter_name,
        instance.id AS instance_id,
        instance.log_group_id,
        speedrun.instance_name,
        instance.difficulty_name,
        instance.max_players,
        (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint AS duration_ms,
        encounter.end_time AS killed_at
    FROM log_instance_encounters encounter
    JOIN representative_instances representative ON representative.id = encounter.instance_id
    JOIN log_instances instance ON instance.id = encounter.instance_id
    JOIN instance_speedruns speedrun ON speedrun.instance_id = encounter.instance_id
    CROSS JOIN snapshot
    WHERE encounter.boss = true
      AND encounter.kill_type = 'clean'
      AND encounter.end_time > encounter.start_time
      AND (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint > 0
      AND encounter.end_time < snapshot.cutoff
      AND (snapshot.window_start IS NULL OR encounter.end_time >= snapshot.window_start)
    ORDER BY representative.run_id, encounter.name,
        (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint ASC,
        encounter.end_time ASC
)
INSERT INTO time_parse_boss_kill_memberships (
    tenant_id, policy_version, query_version,
    run_id, encounter_name,
    instance_id, log_group_id, instance_name,
    difficulty_name, max_players,
    duration_ms, killed_at
)
SELECT
    snapshot.tenant_id, snapshot.policy_version, snapshot.query_version,
    current_member.run_id, current_member.encounter_name,
    current_member.instance_id, current_member.log_group_id, current_member.instance_name,
    current_member.difficulty_name, current_member.max_players,
    current_member.duration_ms, current_member.killed_at
FROM snapshot
CROSS JOIN current_members current_member
ON CONFLICT (
    tenant_id, policy_version, query_version, run_id, encounter_name
) DO UPDATE SET
    instance_id = EXCLUDED.instance_id,
    log_group_id = EXCLUDED.log_group_id,
    instance_name = EXCLUDED.instance_name,
    difficulty_name = EXCLUDED.difficulty_name,
    max_players = EXCLUDED.max_players,
    duration_ms = EXCLUDED.duration_ms,
    killed_at = EXCLUDED.killed_at;

-- name: CountTimeParseBossKillMembershipCohort :one
SELECT COUNT(*)
FROM time_parse_boss_kill_memberships membership
JOIN time_parse_snapshots snapshot ON snapshot.id = @snapshot_id
WHERE membership.tenant_id = snapshot.tenant_id
  AND membership.policy_version = snapshot.policy_version
  AND membership.query_version = snapshot.query_version
  AND membership.killed_at < snapshot.cutoff
  AND (snapshot.window_start IS NULL OR membership.killed_at >= snapshot.window_start);

-- name: GetTimeParseBossKillMembershipCohort :many
SELECT membership.duration_ms
FROM time_parse_boss_kill_memberships membership
JOIN time_parse_snapshots snapshot ON snapshot.id = @snapshot_id
WHERE membership.tenant_id = snapshot.tenant_id
  AND membership.policy_version = snapshot.policy_version
  AND membership.query_version = snapshot.query_version
  AND membership.killed_at < snapshot.cutoff
  AND (snapshot.window_start IS NULL OR membership.killed_at >= snapshot.window_start)
  AND membership.instance_name = @instance_name
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players;

-- name: ListTimeParseBossKillMemberships :many
SELECT *
FROM time_parse_boss_kill_memberships
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version
ORDER BY run_id, encounter_name;

-- name: ListTimeParseBossKillCohortBuckets :many
-- Distinct boss-kill buckets in a snapshot's date window with their sample
-- sizes.
SELECT
    membership.instance_name,
    membership.encounter_name,
    membership.difficulty_name,
    membership.max_players,
    COUNT(*)::bigint AS sample_size
FROM time_parse_boss_kill_memberships membership
JOIN time_parse_snapshots snapshot ON snapshot.id = @snapshot_id
WHERE membership.tenant_id = snapshot.tenant_id
  AND membership.policy_version = snapshot.policy_version
  AND membership.query_version = snapshot.query_version
  AND membership.killed_at < snapshot.cutoff
  AND (snapshot.window_start IS NULL OR membership.killed_at >= snapshot.window_start)
GROUP BY membership.instance_name, membership.encounter_name, membership.difficulty_name, membership.max_players
ORDER BY membership.instance_name, membership.encounter_name, membership.difficulty_name, membership.max_players;

-- name: GetTimeParseBossKillCohortEntries :many
-- Boss-kill cohort members for one bucket, fastest first, with the log and
-- guild identity needed by the cohort viewer. Same membership as
-- GetTimeParseBossKillMembershipCohort.
SELECT
    membership.instance_id,
    membership.duration_ms,
    membership.killed_at,
    li.hashed_slug AS log_hashed_slug,
    g.id AS guild_id,
    g.name AS guild_name
FROM time_parse_boss_kill_memberships membership
JOIN time_parse_snapshots snapshot ON snapshot.id = @snapshot_id
LEFT JOIN log_instances li ON li.id = membership.instance_id
LEFT JOIN guilds g ON g.id = li.guild_id
WHERE membership.tenant_id = snapshot.tenant_id
  AND membership.policy_version = snapshot.policy_version
  AND membership.query_version = snapshot.query_version
  AND membership.killed_at < snapshot.cutoff
  AND (snapshot.window_start IS NULL OR membership.killed_at >= snapshot.window_start)
  AND membership.instance_name = @instance_name
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
ORDER BY membership.duration_ms, membership.killed_at;
