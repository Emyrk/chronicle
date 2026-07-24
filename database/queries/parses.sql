-- name: InsertRankingSnapshot :one
-- Create a new pending snapshot for a tenant+lookback.
INSERT INTO ranking_snapshots (
    tenant_id, cutoff, window_start, lookback_days, cohort_mode,
    policy_version, query_version,
    min_parser_version_num, min_addon_version_num, status,
    source_row_count, source_watermark
) VALUES (
    @tenant_id, @cutoff, @window_start, @lookback_days, @cohort_mode,
    @policy_version, @query_version,
    @min_parser_version_num, @min_addon_version_num, 'pending',
    @source_row_count, @source_watermark
) RETURNING *;

-- name: PublishRankingSnapshot :one
-- Transition a pending snapshot to published. Idempotent on already-published.
UPDATE ranking_snapshots
SET status = 'published', published_at = now()
WHERE id = @id AND status IN ('pending', 'published')
RETURNING *;

-- name: InsertRankingSnapshotMember :exec
-- Insert a single snapshot member (caller batches in a transaction).
INSERT INTO ranking_snapshot_members (
    snapshot_id, ranking_id, instance_id, run_id,
    instance_name, encounter_name,
    player_guid, player_class, player_spec,
    difficulty_name, max_players,
    killed_at, created_at_ranking,
    damage_done, healing_done, absorbed_done,
    duration_secs, dps, hps
) VALUES (
    @snapshot_id, @ranking_id, @instance_id, @run_id,
    @instance_name, @encounter_name,
    @player_guid, @player_class, @player_spec,
    @difficulty_name, @max_players,
    @killed_at, @created_at_ranking,
    @damage_done, @healing_done, @absorbed_done,
    @duration_secs, @dps, @hps
) ON CONFLICT (snapshot_id, ranking_id) DO NOTHING;

-- name: BatchInsertSnapshotMembersFromRankings :exec
-- Populate a pending snapshot's members from eligible encounter_dps_rankings rows.
-- Boss kills only (encounter_id IS NOT NULL), deduplicated by duplicate group
-- keeping the best DPS copy, bounded by the snapshot's cutoff and optional window_start.
-- Note: parser/addon version requirement values are stored on the snapshot for
-- documentation; log_instances does not carry numeric version columns yet, so
-- version filtering is the caller's responsibility if needed.
WITH snapshot AS (
    SELECT id, cutoff, window_start
    FROM ranking_snapshots WHERE id = @snapshot_id
),
eligible AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.id AS ranking_id,
        edr.instance_id,
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        edr.instance_name,
        edr.encounter_name,
        edr.player_guid,
        edr.player_class,
        edr.player_spec,
        edr.difficulty_name,
        edr.max_players,
        edr.killed_at,
        edr.created_at,
        edr.damage_done,
        edr.healing_done,
        edr.absorbed_done,
        edr.duration_secs,
        edr.dps,
        edr.hps
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    CROSS JOIN snapshot s
    WHERE edr.encounter_id IS NOT NULL      -- boss kills only
      AND (edr.dps > 0 OR edr.hps > 0)     -- metric-neutral: include healers with zero damage
      AND edr.duration_secs > 0
      -- Exclusive upper bound: data strictly before the snapshot cutoff (00:00 UTC boundary).
      AND edr.killed_at < s.cutoff
      AND (s.window_start IS NULL OR edr.killed_at >= s.window_start)
    -- Duplicate-group collapse: copies of the same kill are near-identical, so
    -- DPS DESC with HPS DESC tiebreak picks one deterministic representative.
    ORDER BY edr.player_guid, edr.encounter_name,
             COALESCE(li.duplicate_group_id, li.id),
             edr.dps DESC, edr.hps DESC
)
INSERT INTO ranking_snapshot_members (
    snapshot_id, ranking_id, instance_id, run_id,
    instance_name, encounter_name,
    player_guid, player_class, player_spec,
    difficulty_name, max_players,
    killed_at, created_at_ranking,
    damage_done, healing_done, absorbed_done,
    duration_secs, dps, hps
)
SELECT
    @snapshot_id, e.ranking_id, e.instance_id, e.run_id,
    e.instance_name, e.encounter_name,
    e.player_guid, e.player_class, e.player_spec,
    e.difficulty_name, e.max_players,
    e.killed_at, e.created_at,
    e.damage_done, e.healing_done, e.absorbed_done,
    e.duration_secs, e.dps, e.hps
FROM eligible e
ON CONFLICT (snapshot_id, ranking_id) DO NOTHING;

-- name: GetLatestPublishedSnapshot :one
-- Return the most recently published snapshot for a tenant+lookback.
SELECT *
FROM ranking_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND status = 'published'
ORDER BY published_at DESC
LIMIT 1;

-- name: GetLatestPublishedSnapshotBefore :one
-- Return the latest published snapshot whose cutoff <= the given timestamp.
-- Used for canonical parse resolution: a raid compares against the snapshot
-- whose cutoff is at or before the instance's start time.
SELECT *
FROM ranking_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND status = 'published'
  AND cutoff <= @before
ORDER BY cutoff DESC
LIMIT 1;

-- name: GetPublishedSnapshotForCutoff :one
-- Check if a published snapshot already exists for this exact cutoff+key.
-- Used by the idempotency guard (one snapshot per day per key).
SELECT *
FROM ranking_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND cohort_mode = @cohort_mode
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND cutoff = @cutoff
  AND status = 'published'
LIMIT 1;

-- name: GetLogInstanceStartTime :one
-- Return the start_time for a log instance. Used by the parses handler
-- to resolve which snapshot cutoff applies to the instance.
SELECT start_time FROM log_instances WHERE id = @id;

-- name: GetSnapshotCohortValues :many
-- Per-boss cohort: ALL eligible kill metric values within a
-- (snapshot, encounter, difficulty, max_players, class/spec) bucket.
-- Each snapshot member row represents one kill (duplicate-group copies of the
-- same raid are already collapsed to the best copy at insertion time by
-- BatchInsertSnapshotMembersFromRankings). A player with N separate raids
-- contributes N datapoints.
--
-- Rationale: small servers have few players per spec; best-per-player caps the
-- cohort at player count and ratchets upward over time (players only improve
-- their best), inflating difficulty. All-kills cohorts grow with raid activity
-- (20 shamans × 5 raids = 100 datapoints) and keep typical performances in the
-- distribution. This matches Warcraft Logs' documented semantics: parses
-- compare against all logged kills; best-vs-best is reserved for
-- rankings/leaderboards (future #181).
--
-- Pass @metric = 'dps' or 'hps' to select the value column.
SELECT
    rsm.encounter_name,
    rsm.player_guid,
    CASE WHEN @metric::text = 'hps' THEN rsm.hps ELSE rsm.dps END AS metric_value
FROM ranking_snapshot_members rsm
WHERE rsm.snapshot_id = @snapshot_id
  AND rsm.encounter_name = @encounter_name
  AND rsm.difficulty_name = @difficulty_name
  AND rsm.max_players = @max_players
  AND rsm.player_class = @player_class
  AND (sqlc.narg('player_spec')::text IS NULL OR rsm.player_spec = @player_spec)
  -- Only include rows with a positive value for the requested metric so
  -- zero-DPS healers don't appear in DPS cohorts and vice versa.
  AND CASE WHEN @metric::text = 'hps' THEN rsm.hps ELSE rsm.dps END > 0;

-- name: ListSnapshotMembersForInstance :many
-- List all snapshot members from a given instance.
SELECT rsm.*
FROM ranking_snapshot_members rsm
WHERE rsm.snapshot_id = @snapshot_id
  AND rsm.instance_id = @instance_id
ORDER BY rsm.encounter_name, rsm.dps DESC;

-- name: ListSnapshotMembersForInstanceWithNames :many
-- List snapshot members for an instance, joining to encounter_dps_rankings for player name/role.
SELECT rsm.*,
       edr.player_name,
       edr.player_role
FROM ranking_snapshot_members rsm
JOIN encounter_dps_rankings edr ON edr.id = rsm.ranking_id
WHERE rsm.snapshot_id = @snapshot_id
  AND rsm.instance_id = @instance_id
ORDER BY rsm.encounter_name, rsm.dps DESC;

-- name: ListSnapshotMembersByPlayerGUID :many
-- List a player's member entries across a snapshot (for history/best parses).
SELECT rsm.*
FROM ranking_snapshot_members rsm
WHERE rsm.snapshot_id = @snapshot_id
  AND rsm.player_guid = @player_guid
ORDER BY rsm.encounter_name, rsm.dps DESC;

-- name: GetRankingSnapshot :one
SELECT * FROM ranking_snapshots WHERE id = @id;

-- name: CountSnapshotMembers :one
-- Return the number of members in a snapshot.
SELECT COUNT(*) FROM ranking_snapshot_members WHERE snapshot_id = @snapshot_id;

-- name: ListRankingsForInstance :many
-- Load ranking rows for a specific instance directly from encounter_dps_rankings.
-- Used by the parses handler to get the viewed instance's own metric values
-- independent of snapshot membership (the instance may not be a member of the
-- snapshot it scores against, e.g. historical canonical snapshots).
SELECT
    edr.id,
    edr.encounter_name,
    edr.instance_name,
    edr.player_guid,
    edr.player_name,
    edr.player_class,
    edr.player_spec,
    edr.player_role,
    edr.difficulty_name,
    edr.max_players,
    edr.killed_at,
    edr.created_at,
    edr.damage_done,
    edr.healing_done,
    edr.absorbed_done,
    edr.duration_secs,
    edr.dps,
    edr.hps
FROM encounter_dps_rankings edr
WHERE edr.instance_id = @instance_id
  AND edr.encounter_id IS NOT NULL  -- boss kills only
ORDER BY edr.encounter_name, edr.dps DESC;

-- name: GetSnapshotSourceStats :one
-- Compute the eligible row count and max(created_at) for the same eligibility
-- filter as BatchInsertSnapshotMembersFromRankings. Used by the staleness guard
-- to skip redundant snapshot publication when source data is unchanged.
-- IMPORTANT: keep the WHERE clause in sync with BatchInsertSnapshotMembersFromRankings.
SELECT
    COUNT(*)::bigint AS row_count,
    MAX(edr.created_at)::timestamptz AS watermark
FROM encounter_dps_rankings edr
JOIN log_instances li ON li.id = edr.instance_id
WHERE edr.encounter_id IS NOT NULL      -- boss kills only
  AND (edr.dps > 0 OR edr.hps > 0)     -- metric-neutral: must match BatchInsertSnapshotMembersFromRankings
  AND edr.duration_secs > 0
  -- Exclusive upper bound: must match BatchInsertSnapshotMembersFromRankings.
  AND edr.killed_at < @cutoff
  AND (@window_start::timestamptz IS NULL OR edr.killed_at >= @window_start);

-- name: ListPublishedSnapshots :many
-- Return published snapshots for a tenant, most recent first.
SELECT rs.*,
       (SELECT COUNT(*) FROM ranking_snapshot_members WHERE snapshot_id = rs.id) AS member_count
FROM ranking_snapshots rs
WHERE rs.tenant_id = @tenant_id
  AND rs.status = 'published'
ORDER BY rs.published_at DESC
LIMIT 50;

-- name: GetSnapshotCohortDebug :many
-- Extended version of GetSnapshotCohortValues that includes identity fields
-- for debugging/transparency. Joins to encounter_dps_rankings for player_name
-- and log_hashed_slug.
SELECT
    rsm.encounter_name,
    rsm.player_guid,
    edr.player_name,
    rsm.player_class,
    rsm.player_spec,
    rsm.difficulty_name,
    rsm.max_players,
    rsm.killed_at,
    edr.log_hashed_slug,
    CASE WHEN @metric::text = 'hps' THEN rsm.hps ELSE rsm.dps END AS metric_value
FROM ranking_snapshot_members rsm
JOIN encounter_dps_rankings edr ON edr.id = rsm.ranking_id
WHERE rsm.snapshot_id = @snapshot_id
  AND rsm.encounter_name = @encounter_name
  AND rsm.difficulty_name = @difficulty_name
  AND rsm.max_players = @max_players
  AND rsm.player_class = @player_class
  AND (sqlc.narg('player_spec')::text IS NULL OR rsm.player_spec = @player_spec)
  AND CASE WHEN @metric::text = 'hps' THEN rsm.hps ELSE rsm.dps END > 0
ORDER BY CASE WHEN @metric::text = 'hps' THEN rsm.hps ELSE rsm.dps END DESC;

-- name: ListDistinctCohortBuckets :many
-- Return distinct (encounter_name, player_class, player_spec, difficulty_name, max_players)
-- combinations available in a snapshot, for driving filter dropdowns.
SELECT DISTINCT
    rsm.encounter_name,
    rsm.player_class,
    rsm.player_spec,
    rsm.difficulty_name,
    rsm.max_players
FROM ranking_snapshot_members rsm
WHERE rsm.snapshot_id = @snapshot_id
ORDER BY rsm.encounter_name, rsm.player_class, rsm.player_spec;

-- name: GetLatestPublishedSnapshotForGuard :one
-- Return the most recently published snapshot matching the full key dimensions
-- used by the staleness guard (tenant, lookback, cohort_mode, policy_version, query_version).
SELECT *
FROM ranking_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND cohort_mode = @cohort_mode
  AND policy_version = @policy_version
  AND query_version = @query_version
  AND status = 'published'
ORDER BY published_at DESC
LIMIT 1;

