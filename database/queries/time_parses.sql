-- name: InsertTimeParseSnapshot :one
-- Create a new pending time-parse snapshot for a tenant+lookback.
INSERT INTO time_parse_snapshots (
    tenant_id, cutoff, window_start, lookback_days,
    policy_version, query_version, status,
    source_row_count, source_watermark, source_fingerprint
) VALUES (
    @tenant_id, @cutoff, @window_start, @lookback_days,
    @policy_version, @query_version, 'pending',
    @source_row_count, @source_watermark, @source_fingerprint
) RETURNING *;

-- name: PublishTimeParseSnapshot :one
-- Transition a pending time-parse snapshot to published. Idempotent on already-published.
UPDATE time_parse_snapshots
SET status = 'published', published_at = now()
WHERE id = @id AND status IN ('pending', 'published')
RETURNING *;

-- name: GetLatestPublishedTimeParseSnapshot :one
-- Most recently published time-parse snapshot for a tenant+lookback+versions.
SELECT *
FROM time_parse_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND status = 'published'
ORDER BY published_at DESC
LIMIT 1;

-- name: GetLatestPublishedTimeParseSnapshotBefore :one
-- Latest published time-parse snapshot whose cutoff <= given timestamp.
-- Used for canonical parse resolution (day-of-raid snapshot).
SELECT *
FROM time_parse_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND status = 'published'
  AND cutoff <= @before
ORDER BY cutoff DESC
LIMIT 1;

-- name: GetPublishedTimeParseSnapshotForCutoff :one
-- Check if a published time-parse snapshot exists for this exact cutoff+key.
-- Used by the idempotency guard.
SELECT *
FROM time_parse_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND cutoff = @cutoff
  AND status = 'published'
LIMIT 1;

-- name: GetLatestPublishedTimeParseSnapshotForGuard :one
-- Most recently published snapshot matching the full key dimensions (staleness guard).
SELECT *
FROM time_parse_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND status = 'published'
ORDER BY published_at DESC
LIMIT 1;

-- name: GetTimeParseSnapshotSourceStats :one
-- Compute a combined source fingerprint covering both clear-time eligible
-- speedruns and boss-kill eligible encounters. Changes in either source
-- break the staleness guard so new boss encounters or reparses trigger
-- publication.
-- The fingerprint hashes every membership-affecting column via
-- hashtextextended (seed 0 for clears, seed 1 for bosses), sums via
-- numeric to avoid bigint overflow, then reduces modulo a large prime.
-- The two sub-fingerprints are added modulo the same prime so identical
-- content in both populations does not cancel out.
-- Empty populations produce fingerprint = 0 (COALESCE of empty SUM).
-- Compatible with PostgreSQL 13+ (no bit_xor aggregate required).
-- IMPORTANT: keep WHERE clauses in sync with the corresponding publication queries.
WITH clear_stats AS (
    SELECT
        COUNT(*)::bigint AS cnt,
        MAX(sr.start_time)::timestamptz AS wm,
        COALESCE(SUM(hashtextextended(
            sr.instance_id::text || '|' ||
            COALESCE(li.duplicate_group_id, li.id)::text || '|' ||
            sr.qualified::text || '|' ||
            sr.ranked_duration_ms::text || '|' ||
            sr.instance_name || '|' ||
            li.difficulty_name || '|' ||
            li.max_players::text || '|' ||
            sr.start_time::text,
            0
        )::numeric) % 4294967291, 0)::bigint AS fp
    FROM instance_speedruns sr
    JOIN log_instances li ON li.id = sr.instance_id
    JOIN wow_server_realms realm ON realm.id = li.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
    WHERE (server.tenant_id = @tenant_id
           OR (@tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
               AND (server.tenant_id IS NULL OR tenant.include_in_all)))
      AND li.invalidated_at IS NULL
      AND sr.qualified = true
      AND sr.ranked_duration_ms > 0
      AND sr.start_time < @cutoff
      AND (@window_start::timestamptz IS NULL OR sr.start_time >= @window_start)
),
boss_stats AS (
    SELECT
        COUNT(*)::bigint AS cnt,
        MAX(lie.end_time)::timestamptz AS wm,
        COALESCE(SUM(hashtextextended(
            lie.instance_id::text || '|' ||
            COALESCE(li.duplicate_group_id, li.id)::text || '|' ||
            lie.name || '|' ||
            lie.kill_type::text || '|' ||
            lie.boss::text || '|' ||
            lie.start_time::text || '|' ||
            lie.end_time::text || '|' ||
            sr.instance_name || '|' ||
            li.difficulty_name || '|' ||
            li.max_players::text,
            1
        )::numeric) % 4294967291, 0)::bigint AS fp
    FROM log_instance_encounters lie
    JOIN log_instances li ON li.id = lie.instance_id
    JOIN instance_speedruns sr ON sr.instance_id = lie.instance_id
    JOIN wow_server_realms realm ON realm.id = li.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
    WHERE (server.tenant_id = @tenant_id
           OR (@tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
               AND (server.tenant_id IS NULL OR tenant.include_in_all)))
      AND li.invalidated_at IS NULL
      AND lie.boss = true
      AND lie.kill_type = 'clean'
      AND lie.end_time > lie.start_time
      AND (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint > 0
      AND lie.end_time < @cutoff
      AND (@window_start::timestamptz IS NULL OR lie.end_time >= @window_start)
)
SELECT
    (COALESCE(c.cnt, 0) + COALESCE(b.cnt, 0))::bigint AS row_count,
    GREATEST(c.wm, b.wm)::timestamptz AS watermark,
    ((c.fp + b.fp) % 4294967291)::bigint AS fingerprint
FROM clear_stats c, boss_stats b;

-- name: DeleteTimeParseSnapshot :exec
-- Delete a time-parse snapshot by ID. Members are cascade-deleted.
DELETE FROM time_parse_snapshots WHERE id = @id;
-- name: DeleteTimeParseSnapshots :exec
-- Bulk-delete time-parse snapshots by IDs. Members are cascade-deleted via FK.
DELETE FROM time_parse_snapshots WHERE id = ANY(@ids::uuid[]);

-- name: ListAllTimeParseSnapshots :many
-- Admin view: list all time-parse snapshots across tenants, most recent first.
-- LEFT JOINs tenants to surface the tenant name (NULL for root scope).
-- Includes separate clear-time and boss-kill member counts.
SELECT tps.*,
       (
           SELECT COUNT(*)
           FROM time_parse_clear_time_memberships membership
           WHERE membership.tenant_id = tps.tenant_id
             AND membership.policy_version = tps.policy_version
             AND membership.query_version = tps.query_version
             AND membership.start_time < tps.cutoff
             AND (tps.window_start IS NULL OR membership.start_time >= tps.window_start)
       ) AS clear_member_count,
       (
           SELECT COUNT(*)
           FROM time_parse_boss_kill_memberships membership
           WHERE membership.tenant_id = tps.tenant_id
             AND membership.policy_version = tps.policy_version
             AND membership.query_version = tps.query_version
             AND membership.killed_at < tps.cutoff
             AND (tps.window_start IS NULL OR membership.killed_at >= tps.window_start)
       ) AS boss_member_count,
       t.name AS tenant_name
FROM time_parse_snapshots tps
LEFT JOIN tenants t ON t.id = tps.tenant_id
ORDER BY tps.created_at DESC
LIMIT 100;

-- name: GetLogInstanceForTimeParse :one
-- Return the instance name, difficulty, and max_players for time-parse scoring.
SELECT li.name AS instance_name, li.difficulty_name, li.max_players
FROM log_instances li
WHERE li.id = @id;

-- name: ListPublishedTimeParseSnapshots :many
-- Published time-parse snapshots for a tenant and scoring version, newest
-- first. Backs the public cohort viewer's snapshot picker.
SELECT *
FROM time_parse_snapshots
WHERE tenant_id = @tenant_id
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND status = 'published'
ORDER BY published_at DESC
LIMIT 50;

-- name: GetPublishedTimeParseSnapshotByID :one
-- A published time-parse snapshot, scoped to the caller's tenant.
SELECT *
FROM time_parse_snapshots
WHERE id = @id
  AND tenant_id = @tenant_id
  AND status = 'published';

-- name: ListTimeParseClearTimeCohortBuckets :many
-- Distinct clear-time buckets in a snapshot's dynamic date window.
SELECT
    membership.instance_name,
    membership.difficulty_name,
    membership.max_players,
    COUNT(*)::bigint AS sample_size
FROM time_parse_clear_time_memberships membership
JOIN time_parse_snapshots snapshot ON snapshot.id = @snapshot_id
WHERE membership.tenant_id = snapshot.tenant_id
  AND membership.policy_version = snapshot.policy_version
  AND membership.query_version = snapshot.query_version
  AND membership.start_time < snapshot.cutoff
  AND (snapshot.window_start IS NULL OR membership.start_time >= snapshot.window_start)
GROUP BY membership.instance_name, membership.difficulty_name, membership.max_players
ORDER BY membership.instance_name, membership.difficulty_name, membership.max_players;

-- name: GetTimeParseClearTimeCohortEntries :many
-- Clear-time cohort members for one bucket, fastest first, with the log and
-- guild identity needed by the cohort viewer. Uses the same dynamic membership
-- as GetTimeParseClearTimeMembershipCohort.
SELECT
    membership.instance_id,
    membership.duration_ms,
    membership.start_time AS killed_at,
    instance.hashed_slug AS log_hashed_slug,
    guild.id AS guild_id,
    guild.name AS guild_name
FROM time_parse_clear_time_memberships membership
JOIN time_parse_snapshots snapshot ON snapshot.id = @snapshot_id
LEFT JOIN log_instances instance ON instance.id = membership.instance_id
LEFT JOIN guilds guild ON guild.id = instance.guild_id
WHERE membership.tenant_id = snapshot.tenant_id
  AND membership.policy_version = snapshot.policy_version
  AND membership.query_version = snapshot.query_version
  AND membership.start_time < snapshot.cutoff
  AND (snapshot.window_start IS NULL OR membership.start_time >= snapshot.window_start)
  AND membership.instance_name = @instance_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
ORDER BY membership.duration_ms, membership.start_time;
