-- name: InsertRankingSnapshot :one
-- Create a new pending snapshot for a tenant+lookback.
INSERT INTO ranking_snapshots (
    tenant_id, cutoff, window_start, lookback_days, cohort_mode,
    policy_version, query_version,
    min_parser_version_num, min_addon_version_num, status
) VALUES (
    @tenant_id, @cutoff, @window_start, @lookback_days, @cohort_mode,
    @policy_version, @query_version,
    @min_parser_version_num, @min_addon_version_num, 'pending'
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
      AND edr.dps > 0
      AND edr.duration_secs > 0
      AND edr.killed_at <= s.cutoff
      AND (s.window_start IS NULL OR edr.killed_at >= s.window_start)
    ORDER BY edr.player_guid, edr.encounter_name,
             COALESCE(li.duplicate_group_id, li.id),
             edr.dps DESC
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

-- name: GetEarliestSnapshotForInstance :one
-- Return the earliest published snapshot that contains members from a given instance.
SELECT rs.*
FROM ranking_snapshots rs
WHERE rs.tenant_id = @tenant_id
  AND rs.status = 'published'
  AND EXISTS (
      SELECT 1 FROM ranking_snapshot_members rsm
      WHERE rsm.snapshot_id = rs.id AND rsm.instance_id = @instance_id
  )
ORDER BY rs.published_at ASC
LIMIT 1;

-- name: GetSnapshotCohortValues :many
-- Per-boss cohort: best metric value per player within a
-- (snapshot, encounter, difficulty, max_players, class/spec) bucket.
-- Pass @cohort_mode = 'spec' to group by (class, spec), 'class' for class only.
-- Pass @metric = 'dps' or 'hps' to select the value column.
SELECT
    rsm.encounter_name,
    rsm.player_guid,
    CASE WHEN @metric::text = 'hps' THEN MAX(rsm.hps) ELSE MAX(rsm.dps) END AS best_value
FROM ranking_snapshot_members rsm
WHERE rsm.snapshot_id = @snapshot_id
  AND rsm.encounter_name = @encounter_name
  AND rsm.difficulty_name = @difficulty_name
  AND rsm.max_players = @max_players
  AND rsm.player_class = @player_class
  AND (sqlc.narg('player_spec')::text IS NULL OR rsm.player_spec = @player_spec)
GROUP BY rsm.encounter_name, rsm.player_guid;

-- name: ListSnapshotMembersForInstance :many
-- List all snapshot members from a given instance.
SELECT rsm.*
FROM ranking_snapshot_members rsm
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
