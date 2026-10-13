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
-- Run only after a replacement parse has committed or invalidation was cleared.
-- It upserts the current members first, then removes obsolete members from the
-- same source log group. Failed/in-progress reparses never call this query.
WITH series AS MATERIALIZED (
    SELECT DISTINCT tenant_id, policy_version, query_version
    FROM time_parse_snapshots
    WHERE status = 'published'
),
current_members AS MATERIALIZED (
    SELECT DISTINCT ON (COALESCE(instance.duplicate_group_id, instance.id), encounter.name)
        COALESCE(instance.duplicate_group_id, instance.id) AS run_id,
        encounter.name AS encounter_name,
        instance.id AS instance_id,
        instance.log_group_id,
        speedrun.instance_name,
        instance.difficulty_name,
        instance.max_players,
        (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint AS duration_ms,
        encounter.end_time AS killed_at
    FROM log_instances instance
    JOIN instance_speedruns speedrun ON speedrun.instance_id = instance.id
    JOIN log_instance_encounters encounter ON encounter.instance_id = instance.id
    WHERE instance.log_group_id = @log_group_id
      AND instance.invalidated_at IS NULL
      AND encounter.boss = true
      AND encounter.kill_type = 'clean'
      AND encounter.end_time > encounter.start_time
    ORDER BY
        COALESCE(instance.duplicate_group_id, instance.id),
        encounter.name,
        (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::bigint ASC,
        encounter.end_time ASC,
        instance.id ASC
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
    WHERE membership.log_group_id = @log_group_id
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
-- Routine snapshot publication is deliberately upsert-only. Missing rows may
-- be temporary during a reparse and are removed only by lifecycle operations.
WITH snapshot AS (
    SELECT
        time_parse_snapshots.id,
        time_parse_snapshots.tenant_id,
        time_parse_snapshots.policy_version,
        time_parse_snapshots.query_version
    FROM time_parse_snapshots
    WHERE time_parse_snapshots.id = @snapshot_id
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
    current_member.instance_id, instance.log_group_id, current_member.instance_name,
    current_member.difficulty_name, current_member.max_players,
    current_member.duration_ms, current_member.killed_at
FROM snapshot
JOIN time_parse_boss_kill_members current_member
  ON current_member.snapshot_id = snapshot.id
JOIN log_instances instance ON instance.id = current_member.instance_id
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

-- name: CompareTimeParseBossKillMembershipSnapshot :one
WITH snapshot AS (
    SELECT
        time_parse_snapshots.id,
        time_parse_snapshots.tenant_id,
        time_parse_snapshots.window_start,
        time_parse_snapshots.policy_version,
        time_parse_snapshots.query_version,
        time_parse_snapshots.cutoff
    FROM time_parse_snapshots
    WHERE time_parse_snapshots.id = @snapshot_id
),
legacy AS (
    SELECT
        member.run_id, member.encounter_name,
        member.instance_id, member.instance_name,
        member.difficulty_name, member.max_players,
        member.duration_ms, member.killed_at
    FROM time_parse_boss_kill_members member
    JOIN snapshot ON snapshot.id = member.snapshot_id
),
event_members AS (
    SELECT
        membership.run_id, membership.encounter_name,
        membership.instance_id, membership.instance_name,
        membership.difficulty_name, membership.max_players,
        membership.duration_ms, membership.killed_at
    FROM time_parse_boss_kill_memberships membership
    CROSS JOIN snapshot
    WHERE membership.tenant_id = snapshot.tenant_id
      AND membership.policy_version = snapshot.policy_version
      AND membership.query_version = snapshot.query_version
      AND membership.killed_at < snapshot.cutoff
      AND (snapshot.window_start IS NULL OR membership.killed_at >= snapshot.window_start)
),
differences AS (
    (SELECT * FROM legacy EXCEPT ALL SELECT * FROM event_members)
    UNION ALL
    (SELECT * FROM event_members EXCEPT ALL SELECT * FROM legacy)
)
SELECT
    (SELECT COUNT(*) FROM legacy)::bigint AS legacy_count,
    (SELECT COUNT(*) FROM event_members)::bigint AS membership_count,
    (SELECT COUNT(*) FROM differences)::bigint AS difference_count;

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
