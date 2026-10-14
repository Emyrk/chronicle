-- name: GetTimeParseScoreForContract :one
SELECT * FROM time_parse_scores
WHERE tenant_id = @tenant_id
  AND instance_id = @instance_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: DeleteTimeParseScoreForContract :exec
DELETE FROM time_parse_scores
WHERE tenant_id = @tenant_id
  AND instance_id = @instance_id
  AND lookback_days = @lookback_days
  AND policy_version = @policy_version
  AND query_version = @query_version;

-- name: InsertTimeParseScore :one
INSERT INTO time_parse_scores (
    tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
    clear_duration_ms,
    clear_server_precise_score, clear_server_display_score, clear_server_rank,
    clear_server_sample_size, clear_server_status,
    clear_realm_precise_score, clear_realm_display_score, clear_realm_rank,
    clear_realm_sample_size, clear_realm_status,
    clear_guild_precise_score, clear_guild_display_score, clear_guild_rank,
    clear_guild_sample_size, clear_guild_status,
    cutoff, window_start, lookback_days, policy_version, query_version, computed_at
) VALUES (
    @tenant_id, @instance_id, @run_id, @log_group_id, @realm_id, @guild_id,
    @clear_duration_ms,
    @clear_server_precise_score, @clear_server_display_score, @clear_server_rank,
    @clear_server_sample_size, @clear_server_status,
    @clear_realm_precise_score, @clear_realm_display_score, @clear_realm_rank,
    @clear_realm_sample_size, @clear_realm_status,
    @clear_guild_precise_score, @clear_guild_display_score, @clear_guild_rank,
    @clear_guild_sample_size, @clear_guild_status,
    @cutoff, @window_start, @lookback_days, @policy_version, @query_version, now()
)
RETURNING *;

-- name: InsertTimeParseBossScore :exec
INSERT INTO time_parse_boss_scores (
    time_parse_score_id, encounter_id, encounter_name, duration_ms,
    server_precise_score, server_display_score, server_rank, server_sample_size, server_status,
    realm_precise_score, realm_display_score, realm_rank, realm_sample_size, realm_status,
    guild_precise_score, guild_display_score, guild_rank, guild_sample_size, guild_status
) VALUES (
    @time_parse_score_id, @encounter_id, @encounter_name, @duration_ms,
    @server_precise_score, @server_display_score, @server_rank, @server_sample_size, @server_status,
    @realm_precise_score, @realm_display_score, @realm_rank, @realm_sample_size, @realm_status,
    @guild_precise_score, @guild_display_score, @guild_rank, @guild_sample_size, @guild_status
);

-- name: ListTimeParseBossScoresForScore :many
SELECT * FROM time_parse_boss_scores
WHERE time_parse_score_id = @time_parse_score_id
ORDER BY encounter_name;

-- name: AcquireTimeParseScoreLock :exec
SELECT pg_advisory_xact_lock(hashtextextended(@instance_id::text, 0));

-- name: GetTimeParseScoringInstance :one
SELECT
    instance.id,
    COALESCE(instance.duplicate_group_id, instance.id) AS run_id,
    instance.log_group_id,
    instance.realm_id,
    instance.guild_id,
    instance.start_time,
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
  AND instance.start_time IS NOT NULL
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
          SELECT 1 FROM time_parse_scores score
          WHERE score.tenant_id = COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND score.instance_id = instance.id
            AND score.lookback_days = @lookback_days
            AND score.policy_version = @policy_version
            AND score.query_version = @query_version
      )
  )
ORDER BY instance.start_time DESC NULLS LAST, instance.id
LIMIT @max_rows;
