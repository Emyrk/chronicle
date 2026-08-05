-- name: InsertParseScoreResult :exec
-- Persist a single parse score result for an instance+encounter+player+metric.
-- No unique constraint: duplicate uploads are collapsed at read time via run_id DISTINCT ON.
INSERT INTO parse_score_results (
    tenant_id, instance_id, run_id, snapshot_id, log_group_id, guild_id,
    encounter_name, player_guid, player_name, player_class, player_spec, player_role,
    metric, metric_value, precise_score, display_score, rank, sample_size, status,
    instance_name, difficulty_name, max_players, killed_at
) VALUES (
    @tenant_id, @instance_id, @run_id, @snapshot_id, @log_group_id, @guild_id,
    @encounter_name, @player_guid, @player_name, @player_class, @player_spec, @player_role,
    @metric, @metric_value, @precise_score, @display_score, @rank, @sample_size, @status,
    @instance_name, @difficulty_name, @max_players, @killed_at
);

-- name: InsertParseScoreReceipt :one
-- Insert a successful computation receipt. Receipt existence = fully committed success.
-- On conflict (same tenant+instance+snapshot+lookback+policy+query), update counts
-- to reflect re-computation (idempotent upsert).
INSERT INTO parse_score_receipts (
    tenant_id, instance_id, snapshot_id,
    policy_version, query_version, lookback_days,
    source_count, result_count, computed_at
) VALUES (
    @tenant_id, @instance_id, @snapshot_id,
    @policy_version, @query_version, @lookback_days,
    @source_count, @result_count, now()
)
ON CONFLICT (tenant_id, instance_id, snapshot_id, lookback_days, policy_version, query_version) DO UPDATE SET
    source_count   = EXCLUDED.source_count,
    result_count   = EXCLUDED.result_count,
    computed_at    = now()
RETURNING *;

-- name: GetParseScoreReceipt :one
-- Get receipt by instance + snapshot.
SELECT * FROM parse_score_receipts
WHERE instance_id = @instance_id AND snapshot_id = @snapshot_id;

-- name: GetParseScoreReceiptForInstance :many
-- Get all receipts for an instance (any snapshot).
SELECT * FROM parse_score_receipts
WHERE instance_id = @instance_id
ORDER BY computed_at DESC;

-- name: GetParseScoreReceiptForContract :one
-- Verify that the exact persisted projection contract completed successfully.
SELECT *
FROM parse_score_receipts
WHERE tenant_id = @tenant_id
  AND instance_id = @instance_id
  AND snapshot_id = @snapshot_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: ListParseScoreResultsForContract :many
-- Read one persisted result per player and encounter for an exact completed
-- snapshot contract. Results whose snapshot was deleted are intentionally not
-- eligible because their receipt is deleted with the snapshot.
SELECT DISTINCT ON (psr.encounter_name, psr.player_guid)
    psr.*
FROM parse_score_results psr
WHERE psr.tenant_id = @tenant_id
  AND psr.instance_id = @instance_id
  AND psr.snapshot_id = @snapshot_id
  AND psr.metric = @metric
ORDER BY psr.encounter_name, psr.player_guid, psr.precise_score DESC, psr.created_at DESC;

-- name: ListInstancesMissingParseReceipt :many
-- Repair query: find instances that have ranking data (boss kills) but lack
-- a receipt for the given snapshot. This catches instances with no receipt at all,
-- old instances, snapshot deletion/rebuild, and policy/query changes.
-- Returns at most @max_rows rows for bounded batch processing.
SELECT DISTINCT
    edr.instance_id,
    li.start_time,
    COALESCE(li.duplicate_group_id, li.id) AS run_id,
    li.name AS instance_name,
    li.difficulty_name,
    li.max_players,
    li.log_group_id,
    li.guild_id
FROM encounter_dps_rankings edr
JOIN log_instances li ON li.id = edr.instance_id
WHERE edr.encounter_id IS NOT NULL
  AND (edr.dps > 0 OR edr.hps > 0)
  AND NOT EXISTS (
      SELECT 1 FROM parse_score_receipts psr
      WHERE psr.instance_id = edr.instance_id
        AND psr.snapshot_id = @snapshot_id
        AND psr.policy_version = @policy_version
        AND psr.query_version = @query_version
  )
ORDER BY li.start_time DESC NULLS LAST
LIMIT @max_rows;

-- name: GetParseScoreResultsForInstance :many
-- Read deduplicated parse score results for an instance.
-- Uses DISTINCT ON (run_id, encounter, player, snapshot, metric) to collapse duplicate uploads.
SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.player_guid, psr.snapshot_id, psr.metric)
    psr.*
FROM parse_score_results psr
WHERE psr.instance_id = @instance_id
ORDER BY psr.run_id, psr.encounter_name, psr.player_guid, psr.snapshot_id, psr.metric,
         psr.created_at DESC;

-- name: DeleteParseScoreResultsForTenantInstance :exec
-- Remove parse score results for a tenant+instance (before re-computation).
-- Scoped to tenant_id so one tenant's recompute cannot erase another's projections.
DELETE FROM parse_score_results
WHERE tenant_id = @tenant_id AND instance_id = @instance_id;

-- name: GetCharacterParseHistory :many
-- Character history: ALL deduplicated parses over the lookback window.
-- Returns every (run_id, encounter) parse — not just one best per encounter.
-- The caller groups by (instance_name, encounter_name), takes best 3 per group,
-- averages each group, then averages groups for the Score.
SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.snapshot_id)
    psr.id,
    psr.instance_id,
    psr.run_id,
    psr.snapshot_id,
    psr.encounter_name,
    psr.instance_name,
    psr.difficulty_name,
    psr.max_players,
    psr.metric,
    psr.metric_value,
    psr.precise_score,
    psr.display_score,
    psr.rank,
    psr.sample_size,
    psr.status,
    psr.killed_at,
    psr.player_name,
    psr.player_class,
    psr.player_spec,
    psr.player_role
FROM parse_score_results psr
WHERE psr.tenant_id = @tenant_id
  AND psr.player_guid = @player_guid
  AND psr.metric = @metric
  AND psr.status IN ('ok', 'low_confidence')
  AND psr.killed_at >= @since
ORDER BY psr.run_id, psr.encounter_name, psr.snapshot_id, psr.precise_score DESC;

-- name: GetScoringSnapshotBefore :one
-- Return the latest published snapshot whose cutoff <= the given timestamp,
-- matching the current policy_version and query_version.
-- This prevents an incompatible newer snapshot from hiding a compatible older one.
SELECT *
FROM ranking_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND status = 'published'
  AND cutoff <= @before
  AND policy_version = @policy_version
  AND query_version = @query_version
ORDER BY cutoff DESC
LIMIT 1;

-- name: GetScoringSnapshotLatest :one
-- Return the latest published snapshot matching the current policy_version and
-- query_version. Used when instance has no start_time.
SELECT *
FROM ranking_snapshots
WHERE tenant_id = @tenant_id
  AND lookback_days = @lookback_days
  AND status = 'published'
  AND policy_version = @policy_version
  AND query_version = @query_version
ORDER BY published_at DESC
LIMIT 1;

-- name: ListInstancesMissingParseReceiptWithSnapshot :many
-- Repair query: resolve each visible instance's canonical historical snapshot,
-- then return instances that lack a successful receipt for that exact tenant,
-- snapshot, lookback, policy, and query contract. RLS on
-- encounter_dps_rankings scopes candidates to the worker's tenant context.
-- Instances without an eligible snapshot and instances older than the repair
-- window are excluded, so daily repair neither restarts exhausted retry chains
-- nor rewrites long-term parse history.
SELECT
    candidates.instance_id,
    li.start_time,
    COALESCE(li.duplicate_group_id, li.id) AS run_id,
    li.name AS instance_name,
    li.difficulty_name,
    li.max_players,
    li.log_group_id,
    li.guild_id,
    snap.id AS snapshot_id
FROM (
    SELECT DISTINCT edr.instance_id
    FROM encounter_dps_rankings edr
    WHERE edr.encounter_id IS NOT NULL
      AND (edr.dps > 0 OR edr.hps > 0)
) candidates
JOIN log_instances li ON li.id = candidates.instance_id
JOIN LATERAL (
    SELECT rs.id
    FROM ranking_snapshots rs
    WHERE rs.tenant_id = @tenant_id
      AND rs.lookback_days = @lookback_days
      AND rs.status = 'published'
      AND rs.policy_version = @policy_version
      AND rs.query_version = @query_version
      AND (li.start_time IS NULL OR rs.cutoff <= li.start_time)
    ORDER BY rs.cutoff DESC
    LIMIT 1
) snap ON true
WHERE li.start_time >= @repair_since
  AND NOT EXISTS (
    SELECT 1
    FROM parse_score_receipts receipt
    WHERE receipt.tenant_id = @tenant_id
      AND receipt.instance_id = candidates.instance_id
      AND receipt.snapshot_id = snap.id
      AND receipt.lookback_days = @lookback_days
      AND receipt.policy_version = @policy_version
      AND receipt.query_version = @query_version
)
ORDER BY li.start_time DESC NULLS LAST
LIMIT @max_rows;

-- name: GetLogInstanceForScoring :one
-- Fetch instance metadata needed for parse scoring.
SELECT
    li.id,
    COALESCE(li.duplicate_group_id, li.id) AS run_id,
    li.start_time,
    li.name AS instance_name,
    li.difficulty_name,
    li.max_players,
    li.log_group_id,
    li.guild_id
FROM log_instances li
WHERE li.id = @id;
