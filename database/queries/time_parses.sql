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

-- name: BatchInsertTimeParseSnapshotClearTimeMembers :exec
-- Populate clear-time members from eligible instance speedruns.
-- Qualified complete runs only (duration_ms > 0). Duplicate groups collapsed
-- to one representative instance (deterministic: canonical instance first,
-- then earliest start, then smallest UUID).
WITH snapshot AS (
    SELECT id, cutoff, window_start
    FROM time_parse_snapshots WHERE id = @snapshot_id
),
representative_instances AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        li.id,
        COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM log_instances li
    ORDER BY COALESCE(li.duplicate_group_id, li.id),
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
),
eligible AS (
    SELECT DISTINCT ON (ri.run_id)
        sr.instance_id,
        ri.run_id,
        sr.instance_name,
        li.difficulty_name,
        li.max_players,
        sr.duration_ms,
        sr.start_time
    FROM instance_speedruns sr
    JOIN representative_instances ri ON ri.id = sr.instance_id
    JOIN log_instances li ON li.id = sr.instance_id
    CROSS JOIN snapshot s
    WHERE sr.qualified = true
      AND sr.duration_ms > 0
      AND sr.start_time < s.cutoff
      AND (s.window_start IS NULL OR sr.start_time >= s.window_start)
    ORDER BY ri.run_id, sr.duration_ms ASC, sr.start_time ASC, sr.instance_id ASC
)
INSERT INTO time_parse_clear_time_members (
    snapshot_id, instance_id, run_id,
    instance_name, difficulty_name, max_players,
    duration_ms, start_time
)
SELECT
    @snapshot_id, e.instance_id, e.run_id,
    e.instance_name, e.difficulty_name, e.max_players,
    e.duration_ms, e.start_time
FROM eligible e
ON CONFLICT (snapshot_id, instance_id) DO NOTHING;

-- name: BatchInsertTimeParseSnapshotBossKillMembers :exec
-- Populate boss-kill members from eligible encounter kill times.
-- Clean boss kills from cohort-eligible runs (partial or complete).
-- Duplicate groups collapsed per encounter to fastest.
WITH snapshot AS (
    SELECT id, cutoff, window_start
    FROM time_parse_snapshots WHERE id = @snapshot_id
),
representative_instances AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        li.id,
        COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM log_instances li
    ORDER BY COALESCE(li.duplicate_group_id, li.id),
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
),
eligible AS (
    SELECT DISTINCT ON (ri.run_id, lie.name)
        lie.instance_id,
        ri.run_id,
        sr.instance_name,
        lie.name AS encounter_name,
        li.difficulty_name,
        li.max_players,
        (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint AS duration_ms,
        lie.end_time AS killed_at
    FROM log_instance_encounters lie
    JOIN representative_instances ri ON ri.id = lie.instance_id
    JOIN log_instances li ON li.id = lie.instance_id
    JOIN instance_speedruns sr ON sr.instance_id = lie.instance_id
    CROSS JOIN snapshot s
    WHERE lie.boss = true
      AND lie.kill_type = 'clean'
      AND lie.end_time > lie.start_time
      AND (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint > 0
      AND sr.start_time < s.cutoff
      AND (s.window_start IS NULL OR sr.start_time >= s.window_start)
    ORDER BY ri.run_id, lie.name,
             (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint ASC,
             lie.end_time ASC
)
INSERT INTO time_parse_boss_kill_members (
    snapshot_id, instance_id, run_id,
    instance_name, encounter_name,
    difficulty_name, max_players,
    duration_ms, killed_at
)
SELECT
    @snapshot_id, e.instance_id, e.run_id,
    e.instance_name, e.encounter_name,
    e.difficulty_name, e.max_players,
    e.duration_ms, e.killed_at
FROM eligible e
ON CONFLICT (snapshot_id, instance_id, encounter_name) DO NOTHING;

-- name: CountTimeParseSnapshotClearTimeMembers :one
SELECT COUNT(*) FROM time_parse_clear_time_members WHERE snapshot_id = @snapshot_id;

-- name: CountTimeParseSnapshotBossKillMembers :one
SELECT COUNT(*) FROM time_parse_boss_kill_members WHERE snapshot_id = @snapshot_id;

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
-- IMPORTANT: keep WHERE clauses in sync with the corresponding BatchInsert queries.
WITH clear_stats AS (
    SELECT
        COUNT(*)::bigint AS cnt,
        MAX(sr.start_time)::timestamptz AS wm,
        COALESCE(SUM(hashtextextended(
            sr.instance_id::text || '|' ||
            COALESCE(li.duplicate_group_id, li.id)::text || '|' ||
            sr.qualified::text || '|' ||
            sr.duration_ms::text || '|' ||
            sr.instance_name || '|' ||
            li.difficulty_name || '|' ||
            li.max_players::text || '|' ||
            sr.start_time::text,
            0
        )::numeric) % 4294967291, 0)::bigint AS fp
    FROM instance_speedruns sr
    JOIN log_instances li ON li.id = sr.instance_id
    WHERE sr.qualified = true
      AND sr.duration_ms > 0
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
    WHERE lie.boss = true
      AND lie.kill_type = 'clean'
      AND lie.end_time > lie.start_time
      AND (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint > 0
      AND sr.start_time < @cutoff
      AND (@window_start::timestamptz IS NULL OR sr.start_time >= @window_start)
)
SELECT
    (COALESCE(c.cnt, 0) + COALESCE(b.cnt, 0))::bigint AS row_count,
    GREATEST(c.wm, b.wm)::timestamptz AS watermark,
    ((c.fp + b.fp) % 4294967291)::bigint AS fingerprint
FROM clear_stats c, boss_stats b;

-- name: GetTimeParseSnapshotClearTimeCohort :many
-- All clear-time durations for an (instance_name, difficulty, max_players) bucket.
-- Used to score a specific run's clear time against the population.
SELECT
    tpctm.duration_ms
FROM time_parse_clear_time_members tpctm
WHERE tpctm.snapshot_id = @snapshot_id
  AND tpctm.instance_name = @instance_name
  AND tpctm.difficulty_name = @difficulty_name
  AND tpctm.max_players = @max_players;

-- name: GetTimeParseSnapshotBossKillCohort :many
-- All boss-kill durations for an (instance_name, encounter, difficulty, max_players) bucket.
-- Used to score a specific boss kill time against the population.
SELECT
    tpbkm.duration_ms
FROM time_parse_boss_kill_members tpbkm
WHERE tpbkm.snapshot_id = @snapshot_id
  AND tpbkm.instance_name = @instance_name
  AND tpbkm.encounter_name = @encounter_name
  AND tpbkm.difficulty_name = @difficulty_name
  AND tpbkm.max_players = @max_players;

-- name: DeleteTimeParseSnapshot :exec
-- Delete a time-parse snapshot by ID. Members are cascade-deleted.
DELETE FROM time_parse_snapshots WHERE id = @id;

-- name: GetLogInstanceForTimeParse :one
-- Return the instance name, difficulty, and max_players for time-parse scoring.
SELECT li.name AS instance_name, li.difficulty_name, li.max_players
FROM log_instances li
WHERE li.id = @id;
