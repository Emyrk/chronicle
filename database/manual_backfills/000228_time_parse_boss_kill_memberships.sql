-- Run after migration 000228 and the matching application code are deployed.
-- This is intentionally out of band: it scans historical snapshot members and
-- may run for a while, but it does not block application startup.
--
-- The backfill is atomic. Reads continue falling back to legacy snapshot rows
-- until this transaction commits, then use the complete event membership set.
BEGIN;

INSERT INTO time_parse_boss_kill_memberships (
    tenant_id, policy_version, query_version,
    run_id, encounter_name,
    instance_id, log_group_id, instance_name, difficulty_name, max_players,
    duration_ms, killed_at
)
SELECT DISTINCT ON (
    snapshot.tenant_id,
    snapshot.policy_version,
    snapshot.query_version,
    member.run_id,
    member.encounter_name
)
    snapshot.tenant_id,
    snapshot.policy_version,
    snapshot.query_version,
    member.run_id,
    member.encounter_name,
    member.instance_id,
    instance.log_group_id,
    member.instance_name,
    member.difficulty_name,
    member.max_players,
    member.duration_ms,
    member.killed_at
FROM time_parse_snapshots snapshot
JOIN time_parse_boss_kill_members member ON member.snapshot_id = snapshot.id
JOIN log_instances instance ON instance.id = member.instance_id
WHERE snapshot.status = 'published'
ORDER BY
    snapshot.tenant_id,
    snapshot.policy_version,
    snapshot.query_version,
    member.run_id,
    member.encounter_name,
    snapshot.cutoff DESC,
    snapshot.published_at DESC
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

COMMIT;

-- Latest snapshots must match exactly after the backfill. This query should
-- return no rows. Older snapshots may intentionally differ because later
-- uploads and corrections now affect historical cohorts.
WITH latest AS (
    SELECT DISTINCT ON (
        tenant_id, lookback_days, policy_version, query_version
    ) *
    FROM time_parse_snapshots
    WHERE status = 'published'
    ORDER BY
        tenant_id, lookback_days, policy_version, query_version,
        cutoff DESC, published_at DESC
), legacy AS (
    SELECT
        snapshot.id AS snapshot_id,
        member.run_id, member.encounter_name,
        member.instance_id, member.instance_name,
        member.difficulty_name, member.max_players,
        member.duration_ms, member.killed_at
    FROM latest snapshot
    JOIN time_parse_boss_kill_members member ON member.snapshot_id = snapshot.id
), rebuilt AS (
    SELECT
        snapshot.id AS snapshot_id,
        membership.run_id, membership.encounter_name,
        membership.instance_id, membership.instance_name,
        membership.difficulty_name, membership.max_players,
        membership.duration_ms, membership.killed_at
    FROM latest snapshot
    JOIN time_parse_boss_kill_memberships membership
      ON membership.tenant_id = snapshot.tenant_id
     AND membership.policy_version = snapshot.policy_version
     AND membership.query_version = snapshot.query_version
     AND membership.killed_at < snapshot.cutoff
     AND (snapshot.window_start IS NULL OR membership.killed_at >= snapshot.window_start)
), differences AS (
    (SELECT * FROM legacy EXCEPT ALL SELECT * FROM rebuilt)
    UNION ALL
    (SELECT * FROM rebuilt EXCEPT ALL SELECT * FROM legacy)
)
SELECT snapshot_id, count(*) AS difference_count
FROM differences
GROUP BY snapshot_id
ORDER BY snapshot_id;
