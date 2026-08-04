-- name: InsertParseScoreResult :exec
-- Persist a single parse score result for an instance+encounter+player+metric.
INSERT INTO parse_score_results (
    tenant_id, instance_id, run_id, snapshot_id,
    encounter_name, player_guid, player_name, player_class, player_spec, player_role,
    metric, metric_value, precise_score, display_score, rank, sample_size, status,
    instance_name, difficulty_name, max_players, killed_at
) VALUES (
    @tenant_id, @instance_id, @run_id, @snapshot_id,
    @encounter_name, @player_guid, @player_name, @player_class, @player_spec, @player_role,
    @metric, @metric_value, @precise_score, @display_score, @rank, @sample_size, @status,
    @instance_name, @difficulty_name, @max_players, @killed_at
);

-- name: UpsertParseScoreReceipt :one
-- Create or update a computation receipt for an instance.
-- On conflict (re-upload), resets to pending for re-computation.
INSERT INTO parse_score_receipts (
    tenant_id, instance_id, status, attempt, next_attempt_at
) VALUES (
    @tenant_id, @instance_id, 'pending', 0, now()
)
ON CONFLICT (instance_id) DO UPDATE SET
    status = 'pending',
    attempt = 0,
    next_attempt_at = now(),
    completed_at = NULL,
    error_message = NULL
RETURNING *;

-- name: UpdateParseScoreReceiptCompleted :exec
-- Mark a receipt as completed after successful computation.
UPDATE parse_score_receipts
SET status = 'completed',
    snapshot_id = @snapshot_id,
    attempt = attempt + 1,
    last_attempt_at = now(),
    completed_at = now(),
    next_attempt_at = NULL,
    error_message = NULL
WHERE instance_id = @instance_id;

-- name: UpdateParseScoreReceiptNoSnapshot :exec
-- Mark a receipt as no_snapshot with next retry time.
UPDATE parse_score_receipts
SET status = 'no_snapshot',
    attempt = attempt + 1,
    last_attempt_at = now(),
    next_attempt_at = @next_attempt_at,
    error_message = @error_message
WHERE instance_id = @instance_id;

-- name: UpdateParseScoreReceiptFailed :exec
-- Mark a receipt as permanently failed (exhausted retries).
UPDATE parse_score_receipts
SET status = 'failed',
    attempt = attempt + 1,
    last_attempt_at = now(),
    next_attempt_at = NULL,
    error_message = @error_message
WHERE instance_id = @instance_id;

-- name: GetParseScoreReceipt :one
-- Get a receipt by instance ID.
SELECT * FROM parse_score_receipts WHERE instance_id = @instance_id;

-- name: ListParseScoreReceiptsForRetry :many
-- Find receipts ready for retry (bounded repair dispatcher).
-- Returns pending/no_snapshot receipts whose next_attempt_at has passed.
SELECT * FROM parse_score_receipts
WHERE status IN ('pending', 'no_snapshot')
  AND next_attempt_at <= now()
ORDER BY next_attempt_at ASC
LIMIT @max_rows;

-- name: GetParseScoreResultsForInstance :many
-- Read deduplicated parse score results for an instance.
-- Uses DISTINCT ON (run_id, encounter, player, metric) to collapse duplicate uploads.
SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.player_guid, psr.metric)
    psr.*
FROM parse_score_results psr
WHERE psr.instance_id = @instance_id
ORDER BY psr.run_id, psr.encounter_name, psr.player_guid, psr.metric,
         psr.created_at DESC;

-- name: DeleteParseScoreResultsForInstance :exec
-- Remove all parse score results for an instance (before re-computation).
DELETE FROM parse_score_results WHERE instance_id = @instance_id;

-- name: GetCharacterParseHistory :many
-- Character history: best parse per encounter from recent instances (60-day window).
-- Deduplicated by run_id; returns best 3 per encounter for Score calculation.
-- The caller uses these rows to derive the 60-day Score.
SELECT DISTINCT ON (psr.run_id, psr.encounter_name)
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
ORDER BY psr.run_id, psr.encounter_name, psr.precise_score DESC;

-- name: GetLogInstanceForScoring :one
-- Fetch instance metadata needed for parse scoring (duplicate_group, start_time).
-- Tenant ID comes from job args, not the DB.
SELECT
    li.id,
    COALESCE(li.duplicate_group_id, li.id) AS run_id,
    li.start_time,
    li.name AS instance_name,
    li.difficulty_name,
    li.max_players
FROM log_instances li
WHERE li.id = @id;
