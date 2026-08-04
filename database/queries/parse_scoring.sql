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
-- On conflict (same instance+snapshot), update counts to reflect re-computation.
INSERT INTO parse_score_receipts (
    tenant_id, instance_id, snapshot_id,
    policy_version, query_version, lookback_days,
    source_count, result_count, computed_at
) VALUES (
    @tenant_id, @instance_id, @snapshot_id,
    @policy_version, @query_version, @lookback_days,
    @source_count, @result_count, now()
)
ON CONFLICT (instance_id, snapshot_id) DO UPDATE SET
    policy_version = EXCLUDED.policy_version,
    query_version  = EXCLUDED.query_version,
    lookback_days  = EXCLUDED.lookback_days,
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

-- name: DeleteParseScoreResultsForInstance :exec
-- Remove all parse score results for an instance (before re-computation).
DELETE FROM parse_score_results WHERE instance_id = @instance_id;

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
