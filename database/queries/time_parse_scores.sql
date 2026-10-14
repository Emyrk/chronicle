-- name: GetTimeParseScoreReceiptForContract :one
SELECT * FROM time_parse_score_receipts
WHERE tenant_id = @tenant_id
  AND instance_id = @instance_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: DeleteTimeParseScoreReceiptForContract :exec
DELETE FROM time_parse_score_receipts
WHERE tenant_id = @tenant_id
  AND instance_id = @instance_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: InsertTimeParseScoreReceipt :one
INSERT INTO time_parse_score_receipts (
    tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
    cutoff, window_start, lookback_days, policy_version, query_version,
    source_count, result_count, computed_at
) VALUES (
    @tenant_id, @instance_id, @run_id, @log_group_id, @realm_id, @guild_id,
    @cutoff, @window_start, @lookback_days, @policy_version, @query_version,
    @source_count, @result_count, now()
)
RETURNING *;

-- name: InsertTimeParseScoreResult :exec
INSERT INTO time_parse_score_results (
    receipt_id, tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
    scope, metric_kind, encounter_id, encounter_name, duration_ms,
    precise_score, display_score, rank, sample_size, status,
    cutoff, window_start, lookback_days, policy_version, query_version, computed_at
) VALUES (
    @receipt_id, @tenant_id, @instance_id, @run_id, @log_group_id, @realm_id, @guild_id,
    @scope, @metric_kind, @encounter_id, @encounter_name, @duration_ms,
    @precise_score, @display_score, @rank, @sample_size, @status,
    @cutoff, @window_start, @lookback_days, @policy_version, @query_version, now()
);

-- name: ListTimeParseScoreResultsForReceipt :many
SELECT * FROM time_parse_score_results
WHERE receipt_id = @receipt_id
ORDER BY scope, metric_kind, encounter_name;

-- name: AcquireTimeParseScoreLock :exec
SELECT pg_advisory_xact_lock(hashtextextended(@instance_id::text, 0));

-- name: GetTimeParseScoringInstance :one
SELECT
    instance.id,
    COALESCE(instance.duplicate_group_id, instance.id) AS run_id,
    instance.log_group_id,
    instance.realm_id,
    instance.guild_id,
    instance.name AS instance_name,
    instance.difficulty_name,
    instance.max_players
FROM log_instances instance
JOIN wow_server_realms realm ON realm.id = instance.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE instance.id = @id
  AND COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = @tenant_id
  AND instance.invalidated_at IS NULL;

-- name: GetScopedTimeParseClearTimeCohort :many
SELECT membership.duration_ms
FROM time_parse_clear_time_memberships membership
JOIN log_instances instance ON instance.id = membership.instance_id
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.start_time < @cutoff
  AND membership.start_time >= @window_start
  AND membership.run_id <> @exclude_run_id
  AND membership.instance_name = @instance_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
  AND CASE @scope::text
      WHEN 'server' THEN true
      WHEN 'realm' THEN instance.realm_id = @realm_id
      WHEN 'guild' THEN @guild_id::uuid IS NOT NULL AND instance.guild_id = @guild_id
      ELSE false
  END;

-- name: GetScopedTimeParseBossKillCohort :many
SELECT membership.duration_ms
FROM time_parse_boss_kill_memberships membership
JOIN log_instances instance ON instance.id = membership.instance_id
WHERE membership.tenant_id = @tenant_id
  AND membership.policy_version = @policy_version
  AND membership.query_version = @query_version
  AND membership.killed_at < @cutoff
  AND membership.killed_at >= @window_start
  AND membership.run_id <> @exclude_run_id
  AND membership.instance_name = @instance_name
  AND membership.encounter_name = @encounter_name
  AND membership.difficulty_name = @difficulty_name
  AND membership.max_players = @max_players
  AND CASE @scope::text
      WHEN 'server' THEN true
      WHEN 'realm' THEN instance.realm_id = @realm_id
      WHEN 'guild' THEN @guild_id::uuid IS NOT NULL AND instance.guild_id = @guild_id
      ELSE false
  END;

-- name: ListInstancesMissingTimeParseScores :many
SELECT
    instance.id AS instance_id,
    COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id,
    instance.start_time
FROM log_instances instance
JOIN wow_server_realms realm ON realm.id = instance.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE instance.invalidated_at IS NULL
  AND (@all_tenants::boolean OR COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = @tenant_filter)
  AND (@started_after::timestamptz IS NULL OR instance.start_time >= @started_after)
  AND (@started_before::timestamptz IS NULL OR instance.start_time < @started_before)
  AND (
      EXISTS (
          SELECT 1 FROM instance_speedruns speedrun
          WHERE speedrun.instance_id = instance.id
            AND speedrun.qualified = true
            AND speedrun.ranked_duration_ms > 0
      )
      OR EXISTS (
          SELECT 1 FROM log_instance_encounters encounter
          WHERE encounter.instance_id = instance.id
            AND encounter.boss = true
            AND encounter.kill_type = 'clean'
            AND encounter.end_time > encounter.start_time
      )
  )
  AND (
      @force::boolean
      OR NOT EXISTS (
          SELECT 1 FROM time_parse_score_receipts receipt
          WHERE receipt.tenant_id = COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND receipt.instance_id = instance.id
            AND receipt.lookback_days = @lookback_days
            AND receipt.policy_version = @policy_version
            AND receipt.query_version = @query_version
      )
  )
ORDER BY instance.start_time DESC NULLS LAST, instance.id
LIMIT @max_rows;
