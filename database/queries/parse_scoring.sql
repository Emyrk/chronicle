-- name: InsertParseScoreResult :exec
-- Persist a single parse score result for an instance+encounter+player+metric.
-- No unique constraint: duplicate uploads are collapsed at read time via run_id DISTINCT ON.
INSERT INTO parse_score_results (
    tenant_id, instance_id, run_id, snapshot_id, log_group_id, guild_id,
    encounter_name, player_guid, player_name, player_class, player_spec, player_sub_spec, player_role,
    metric, metric_value, precise_score, display_score, rank, sample_size, status,
    instance_name, difficulty_name, max_players, killed_at
)
SELECT
    @tenant_id, @instance_id, @run_id, @snapshot_id, @log_group_id, @guild_id,
    @encounter_name, @player_guid, @player_name, @player_class, @player_spec, @player_sub_spec, @player_role,
    @metric, @metric_value, @precise_score, @display_score, @rank, @sample_size, @status,
    @instance_name, @difficulty_name, @max_players, @killed_at
WHERE EXISTS (
    SELECT 1
    FROM log_instances instance
    JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id
    WHERE instance.id = @instance_id AND NOT log_group.unlisted
);

-- name: InsertWindowedParseScoreReceipt :one
-- New scoring contracts are identified by the target instance cutoff and do not
-- require a ranking snapshot.
INSERT INTO parse_score_receipts (
    tenant_id, instance_id, snapshot_id,
    policy_version, query_version, lookback_days,
    source_count, result_count, cutoff, window_start, cohort_mode, computed_at
)
SELECT
    @tenant_id, @instance_id, NULL,
    @policy_version, @query_version, @lookback_days,
    @source_count, @result_count, @cutoff, @window_start, @cohort_mode, now()
WHERE EXISTS (
    SELECT 1
    FROM log_instances instance
    JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id
    WHERE instance.id = @instance_id AND NOT log_group.unlisted
)
ON CONFLICT (tenant_id, instance_id, lookback_days, policy_version, query_version)
WHERE snapshot_id IS NULL
DO UPDATE SET
    source_count = EXCLUDED.source_count,
    result_count = EXCLUDED.result_count,
    cutoff = EXCLUDED.cutoff,
    window_start = EXCLUDED.window_start,
    cohort_mode = EXCLUDED.cohort_mode,
    computed_at = now()
RETURNING *;

-- name: AcquireParseScoreLock :exec
SELECT pg_advisory_xact_lock(hashtextextended(@lock_key, 0));

-- name: GetAnyParseScoreReceiptForTenantInstance :one
SELECT receipt.*
FROM parse_score_receipts receipt
JOIN log_instances instance ON instance.id = receipt.instance_id
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
WHERE receipt.tenant_id = @tenant_id
  AND receipt.instance_id = @instance_id
ORDER BY computed_at DESC
LIMIT 1;

-- name: HasParseScoreResultsForTenantInstance :one
SELECT EXISTS (
    SELECT 1
    FROM parse_score_results result
    JOIN log_instances visibility_instance ON visibility_instance.id = result.instance_id
    JOIN wow_log_groups log_group ON log_group.id = visibility_instance.log_group_id AND NOT log_group.unlisted
    WHERE result.tenant_id = @tenant_id AND result.instance_id = @instance_id
);

-- name: GetParseScoreReceiptForInstance :many
-- Get all receipts for an instance (any snapshot).
SELECT receipt.* FROM parse_score_receipts receipt
JOIN log_instances instance ON instance.id = receipt.instance_id
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
WHERE receipt.instance_id = @instance_id
ORDER BY computed_at DESC;

-- name: ListParseScoreResultsForContract :many
-- Read one persisted legacy result per player and encounter for the snapshot ID
-- retained as opaque provenance on its successful receipt.
SELECT DISTINCT ON (psr.encounter_name, psr.player_guid)
    psr.*
FROM parse_score_results psr
JOIN log_instances visibility_instance ON visibility_instance.id = psr.instance_id
JOIN wow_log_groups log_group ON log_group.id = visibility_instance.log_group_id AND NOT log_group.unlisted
WHERE psr.tenant_id = @tenant_id
  AND psr.instance_id = @instance_id
  AND psr.snapshot_id = @snapshot_id::uuid
  AND psr.metric = @metric
ORDER BY psr.encounter_name, psr.player_guid, psr.precise_score DESC, psr.created_at DESC;

-- name: ListWindowedParseScoreResultsForContract :many
SELECT DISTINCT ON (psr.encounter_name, psr.player_guid)
    psr.*
FROM parse_score_results psr
JOIN log_instances visibility_instance ON visibility_instance.id = psr.instance_id
JOIN wow_log_groups log_group ON log_group.id = visibility_instance.log_group_id AND NOT log_group.unlisted
WHERE psr.tenant_id = @tenant_id
  AND psr.instance_id = @instance_id
  AND psr.snapshot_id IS NULL
  AND psr.metric = @metric
ORDER BY psr.encounter_name, psr.player_guid, psr.precise_score DESC, psr.created_at DESC;

-- name: ListPersistedParseScoreResultsForInstance :many
-- Receipt-less results are authoritative historical data. Read them without
-- joining snapshot tables or score memberships so they can never be recomputed.
SELECT DISTINCT ON (psr.encounter_name, psr.player_guid)
    psr.*
FROM parse_score_results psr
JOIN log_instances visibility_instance ON visibility_instance.id = psr.instance_id
JOIN wow_log_groups log_group ON log_group.id = visibility_instance.log_group_id AND NOT log_group.unlisted
WHERE psr.tenant_id = @tenant_id
  AND psr.instance_id = @instance_id
  AND psr.metric = @metric
ORDER BY psr.encounter_name, psr.player_guid, psr.created_at DESC, psr.precise_score DESC;

-- name: GetParseScoreResultsForInstance :many
-- Read deduplicated parse score results for an instance.
-- Uses DISTINCT ON (run_id, encounter, player, snapshot, metric) to collapse duplicate uploads.
SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.player_guid, psr.snapshot_id, psr.metric)
    psr.*
FROM parse_score_results psr
JOIN log_instances visibility_instance ON visibility_instance.id = psr.instance_id
JOIN wow_log_groups log_group ON log_group.id = visibility_instance.log_group_id AND NOT log_group.unlisted
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
-- Duplicate uploads of the same run collapse to one row per encounter even
-- when they were scored against different snapshots; the most recently
-- computed scoring wins so a night's rows stay internally consistent.
-- The caller groups by (instance_name, encounter_name), takes best 3 per group,
-- averages each group, then averages groups for the Score.
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
    psr.player_sub_spec,
    psr.player_role
FROM parse_score_results psr
JOIN log_instances visibility_instance ON visibility_instance.id = psr.instance_id
JOIN wow_log_groups log_group ON log_group.id = visibility_instance.log_group_id AND NOT log_group.unlisted
WHERE psr.tenant_id = @tenant_id
  AND psr.player_guid = @player_guid
  AND psr.metric = @metric
  AND psr.status IN ('ok', 'low_confidence')
  AND psr.killed_at >= @since
ORDER BY psr.run_id, psr.encounter_name, psr.created_at DESC, psr.precise_score DESC;

-- name: ListInstancesMissingParseReceiptWindowed :many
-- Bound automatic repair to recent instances with no successful parse receipt at
-- all. Legacy snapshot-backed receipts remain authoritative and are never
-- selected merely because windowed scoring uses a newer query version.
SELECT
    candidates.instance_id,
    li.start_time,
    COALESCE(li.duplicate_group_id, li.id) AS run_id,
    li.name AS instance_name,
    li.difficulty_name,
    li.max_players,
    li.log_group_id,
    li.guild_id
FROM (
    SELECT DISTINCT edr.instance_id
    FROM encounter_dps_rankings edr
    WHERE edr.encounter_id IS NOT NULL
      AND (edr.dps > 0 OR edr.hps > 0)
) candidates
JOIN log_instances li ON li.id = candidates.instance_id
JOIN wow_log_groups log_group ON log_group.id = li.log_group_id AND NOT log_group.unlisted
WHERE li.start_time >= @repair_since
  AND li.invalidated_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM parse_score_receipts receipt
    WHERE receipt.tenant_id = @tenant_id
      AND receipt.instance_id = candidates.instance_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM parse_score_results result
    WHERE result.tenant_id = @tenant_id
      AND result.instance_id = candidates.instance_id
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
JOIN wow_log_groups log_group ON log_group.id = li.log_group_id AND NOT log_group.unlisted
WHERE li.id = @id
  AND li.invalidated_at IS NULL;
