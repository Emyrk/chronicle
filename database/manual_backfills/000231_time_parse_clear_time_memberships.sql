-- PRE-REMOVAL ONLY: run before migrations 000232 and 000233. Those migrations
-- permanently remove the snapshot and legacy member tables used for verification.

-- Run only after migration 000231 and the matching application code are deployed.
-- This is intentionally out of band. It scans all current instances, speedruns,
-- and encounter ranking coverage, so review EXPLAIN output and production row
-- counts first. Do not move this rewrite into a startup migration.
--
-- The transaction is atomic. Runtime reads use the compact table immediately,
-- so schedule this before enabling the new application version or during a
-- maintenance window where an initially empty cohort is acceptable.
BEGIN;

WITH series AS MATERIALIZED (
    SELECT DISTINCT tenant_id, policy_version, query_version
    FROM time_parse_snapshots
    WHERE status = 'published'
),
representative_instances AS MATERIALIZED (
    SELECT DISTINCT ON (COALESCE(instance.duplicate_group_id, instance.id))
        instance.id,
        COALESCE(instance.duplicate_group_id, instance.id) AS run_id
    FROM log_instances instance
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
        representative.run_id,
        speedrun.instance_id,
        instance.log_group_id,
        speedrun.instance_name,
        instance.difficulty_name,
        instance.max_players,
        speedrun.ranked_duration_ms::bigint AS duration_ms,
        speedrun.start_time::timestamptz AS start_time,
        server.tenant_id AS source_tenant_id
    FROM representative_instances representative
    JOIN log_instances instance ON instance.id = representative.id
    JOIN instance_speedruns speedrun ON speedrun.instance_id = representative.id
    JOIN wow_server_realms realm ON realm.id = instance.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    WHERE speedrun.qualified = true
      AND speedrun.ranked_duration_ms > 0
)
INSERT INTO time_parse_clear_time_memberships (
    tenant_id, policy_version, query_version, run_id,
    instance_id, log_group_id, instance_name,
    difficulty_name, max_players, duration_ms, start_time
)
SELECT
    series.tenant_id, series.policy_version, series.query_version, member.run_id,
    member.instance_id, member.log_group_id, member.instance_name,
    member.difficulty_name, member.max_players, member.duration_ms, member.start_time
FROM series
JOIN current_members member
  ON (series.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND member.source_tenant_id IS NULL)
  OR (series.tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid
      AND member.source_tenant_id = series.tenant_id)
ON CONFLICT (tenant_id, policy_version, query_version, run_id) DO UPDATE SET
    instance_id = EXCLUDED.instance_id,
    log_group_id = EXCLUDED.log_group_id,
    instance_name = EXCLUDED.instance_name,
    difficulty_name = EXCLUDED.difficulty_name,
    max_players = EXCLUDED.max_players,
    duration_ms = EXCLUDED.duration_ms,
    start_time = EXCLUDED.start_time;

COMMIT;

-- Verification 1: duplicate logical memberships. Expect zero rows.
SELECT tenant_id, policy_version, query_version, run_id, COUNT(*)
FROM time_parse_clear_time_memberships
GROUP BY tenant_id, policy_version, query_version, run_id
HAVING COUNT(*) > 1;

-- Verification 2: broken source provenance. Expect zero.
SELECT COUNT(*) AS missing_source_rows
FROM time_parse_clear_time_memberships membership
LEFT JOIN log_instances instance ON instance.id = membership.instance_id
LEFT JOIN wow_log_groups log_group ON log_group.id = membership.log_group_id
WHERE instance.id IS NULL
   OR log_group.id IS NULL
   OR instance.log_group_id <> membership.log_group_id;

-- Verification 3: latest published snapshots must match the legacy full-copy
-- cohort. Expect zero rows. Older snapshots may intentionally differ because
-- later uploads, corrections, and invalidations affect historical cohorts.
WITH latest AS (
    SELECT DISTINCT ON (tenant_id, lookback_days, policy_version, query_version) *
    FROM time_parse_snapshots
    WHERE status = 'published'
    ORDER BY tenant_id, lookback_days, policy_version, query_version,
        cutoff DESC, published_at DESC
), legacy AS (
    SELECT
        snapshot.id AS snapshot_id,
        member.run_id, member.instance_name, member.difficulty_name,
        member.max_players, member.duration_ms
    FROM latest snapshot
    JOIN time_parse_clear_time_members member ON member.snapshot_id = snapshot.id
), rebuilt AS (
    SELECT
        snapshot.id AS snapshot_id,
        membership.run_id, membership.instance_name, membership.difficulty_name,
        membership.max_players, membership.duration_ms
    FROM latest snapshot
    JOIN time_parse_clear_time_memberships membership
      ON membership.tenant_id = snapshot.tenant_id
     AND membership.policy_version = snapshot.policy_version
     AND membership.query_version = snapshot.query_version
     AND membership.start_time < snapshot.cutoff
     AND (snapshot.window_start IS NULL OR membership.start_time >= snapshot.window_start)
), differences AS (
    (SELECT * FROM legacy EXCEPT ALL SELECT * FROM rebuilt)
    UNION ALL
    (SELECT * FROM rebuilt EXCEPT ALL SELECT * FROM legacy)
)
SELECT snapshot_id, COUNT(*) AS difference_count
FROM differences
GROUP BY snapshot_id
ORDER BY snapshot_id;

-- Verification 4: compare per-snapshot counts for the latest snapshots.
WITH latest AS (
    SELECT DISTINCT ON (tenant_id, lookback_days, policy_version, query_version) *
    FROM time_parse_snapshots
    WHERE status = 'published'
    ORDER BY tenant_id, lookback_days, policy_version, query_version,
        cutoff DESC, published_at DESC
)
SELECT
    snapshot.id,
    (SELECT COUNT(*) FROM time_parse_clear_time_members legacy
     WHERE legacy.snapshot_id = snapshot.id) AS legacy_count,
    (SELECT COUNT(*) FROM time_parse_clear_time_memberships membership
     WHERE membership.tenant_id = snapshot.tenant_id
       AND membership.policy_version = snapshot.policy_version
       AND membership.query_version = snapshot.query_version
       AND membership.start_time < snapshot.cutoff
       AND (snapshot.window_start IS NULL OR membership.start_time >= snapshot.window_start)) AS compact_count
FROM latest snapshot
ORDER BY snapshot.id;

-- Only after all application instances run code with no handwritten dependency
-- on time_parse_clear_time_members, the backfill committed, and verification is
-- clean, the legacy table may be removed manually:
-- DROP TABLE time_parse_clear_time_members;
