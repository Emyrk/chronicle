-- These callable calculations publish one exact scope from one statement snapshot.
-- Evidence is already canonical/eligible; compatibility versions are metadata,
-- not filters. Callers own transactions and future revision/publication fencing.
-- No producer, queue acknowledgement, or concurrency fence is installed here.

-- name: MaterializeLeaderboardPlayerBossBenchmark :exec
WITH calculated AS (
    SELECT metric_value AS best_metric
    FROM leaderboard_player_observations
    WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND player_class = @player_class::text
      AND player_spec = @player_spec::text
      AND player_sub_spec = @player_sub_spec::text
      AND metric = @metric::text
    ORDER BY metric_value DESC
    LIMIT 1
), written AS (
    INSERT INTO leaderboard_player_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, best_metric, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @player_class::text, @player_spec::text, @player_sub_spec::text, @metric::text, best_metric, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric) DO UPDATE SET
        best_metric = EXCLUDED.best_metric,
        projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version,
        computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_player_boss_benchmarks
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND player_class = @player_class::text
      AND player_spec = @player_spec::text
      AND player_sub_spec = @player_sub_spec::text
      AND metric = @metric::text
  AND NOT EXISTS (SELECT 1 FROM calculated);

-- name: MaterializeLeaderboardPlayerBossSubject :exec
WITH scoped AS MATERIALIZED (
    SELECT * FROM leaderboard_player_observations WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND player_class = @player_class::text
      AND player_spec = @player_spec::text
      AND player_sub_spec = @player_sub_spec::text
      AND metric = @metric::text
      AND realm_id = @realm_id::uuid
      AND player_guid = @player_guid::text
), ranked AS (
    SELECT *, row_number() OVER (ORDER BY metric_value ASC, run_id) AS position,
           count(*) OVER () AS observations
    FROM scoped
), statistics AS (
    SELECT count(*)::bigint AS observation_count,
           max(metric_value) AS raw_peak,
           COALESCE(avg(metric_value) FILTER (WHERE position > observations * 2 / 5 AND position < observations), 0)::double precision AS raw_form,
           COALESCE(avg(metric_value) FILTER (WHERE position > observations / 5 AND position <= observations * 2 / 5), 0)::double precision AS raw_floor
    FROM ranked HAVING count(*) > 0
), peak AS (
    SELECT * FROM scoped ORDER BY metric_value DESC, source_encounter_id ASC, run_id ASC LIMIT 1
), provenance AS (
    -- Do not substitute another observation when the actual peak source is gone.
    -- Source joins are identity-qualified, not just a coincidental encounter UUID.
    SELECT e.id, floor(extract(epoch FROM (e.end_time - e.start_time)) * 1000)::bigint AS duration_ms
    FROM peak p
    JOIN log_instance_encounters e ON e.id = p.source_encounter_id
      AND e.instance_id = p.source_instance_id AND e.name = p.encounter_name
    JOIN log_instances i ON i.id = e.instance_id AND i.realm_id = p.realm_id
      AND i.name = p.instance_name AND i.difficulty_name = p.difficulty_name AND i.max_players = p.max_players
    JOIN wow_server_realms r ON r.id = i.realm_id
    JOIN wow_servers s ON s.id = r.server_id AND s.tenant_id = p.tenant_id
    WHERE e.end_time > e.start_time
      AND floor(extract(epoch FROM (e.end_time - e.start_time)) * 1000) > 0
), calculated AS (
    SELECT statistics.*, provenance.id AS peak_encounter_id, provenance.duration_ms AS peak_duration_ms
    FROM statistics LEFT JOIN provenance ON true
), written AS (
    INSERT INTO leaderboard_player_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid, observation_count, raw_peak, raw_form, raw_floor, peak_encounter_id, peak_duration_ms, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @player_class::text, @player_spec::text, @player_sub_spec::text, @metric::text, @realm_id::uuid, @player_guid::text, observation_count, raw_peak, raw_form, raw_floor, peak_encounter_id, peak_duration_ms, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid) DO UPDATE SET
        observation_count = EXCLUDED.observation_count,
        raw_peak = EXCLUDED.raw_peak,
        raw_form = EXCLUDED.raw_form,
        raw_floor = EXCLUDED.raw_floor,
        peak_encounter_id = EXCLUDED.peak_encounter_id,
        peak_duration_ms = EXCLUDED.peak_duration_ms,
        projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version,
        computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_player_boss_subjects
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND player_class = @player_class::text
      AND player_spec = @player_spec::text
      AND player_sub_spec = @player_sub_spec::text
      AND metric = @metric::text
      AND realm_id = @realm_id::uuid
      AND player_guid = @player_guid::text
  AND NOT EXISTS (SELECT 1 FROM calculated);

-- name: MaterializeLeaderboardGuildBossBenchmark :exec
WITH calculated AS (
    SELECT duration_ms AS best_duration_ms
    FROM leaderboard_guild_boss_observations
    WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
    ORDER BY duration_ms ASC
    LIMIT 1
), written AS (
    INSERT INTO leaderboard_guild_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, best_duration_ms, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, best_duration_ms, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name) DO UPDATE SET
        best_duration_ms = EXCLUDED.best_duration_ms,
        projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version,
        computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_guild_boss_benchmarks
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
  AND NOT EXISTS (SELECT 1 FROM calculated);

-- name: MaterializeLeaderboardGuildBossSubject :exec
WITH scoped AS MATERIALIZED (
    SELECT * FROM leaderboard_guild_boss_observations WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND realm_id = @realm_id::uuid
      AND guild_id = @guild_id::uuid
), ranked AS (
    SELECT *, row_number() OVER (ORDER BY duration_ms DESC, run_id) AS position,
           count(*) OVER () AS observations
    FROM scoped
), statistics AS (
    SELECT count(*)::bigint AS observation_count,
           min(duration_ms) AS fastest_duration_ms,
           COALESCE(avg(1.0::double precision / duration_ms) FILTER (WHERE position > observations * 2 / 5 AND position < observations), 0)::double precision AS form_mean_inverse_ms,
           COALESCE(avg(1.0::double precision / duration_ms) FILTER (WHERE position > observations / 5 AND position <= observations * 2 / 5), 0)::double precision AS floor_mean_inverse_ms
    FROM ranked HAVING count(*) > 0
), calculated AS (SELECT * FROM statistics), written AS (
    INSERT INTO leaderboard_guild_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id, observation_count, fastest_duration_ms, form_mean_inverse_ms, floor_mean_inverse_ms, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @realm_id::uuid, @guild_id::uuid, observation_count, fastest_duration_ms, form_mean_inverse_ms, floor_mean_inverse_ms, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET
        observation_count = EXCLUDED.observation_count,
        fastest_duration_ms = EXCLUDED.fastest_duration_ms,
        form_mean_inverse_ms = EXCLUDED.form_mean_inverse_ms,
        floor_mean_inverse_ms = EXCLUDED.floor_mean_inverse_ms,
        projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version,
        computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_guild_boss_subjects
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND realm_id = @realm_id::uuid
      AND guild_id = @guild_id::uuid
  AND NOT EXISTS (SELECT 1 FROM calculated);

-- name: MaterializeLeaderboardGuildClearBenchmark :exec
WITH calculated AS (
    SELECT duration_ms AS best_duration_ms
    FROM leaderboard_guild_clear_observations
    WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
    ORDER BY duration_ms ASC
    LIMIT 1
), written AS (
    INSERT INTO leaderboard_guild_clear_benchmarks (tenant_id, instance_name, difficulty_name, max_players, best_duration_ms, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, best_duration_ms, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players) DO UPDATE SET
        best_duration_ms = EXCLUDED.best_duration_ms,
        projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version,
        computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_guild_clear_benchmarks
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
  AND NOT EXISTS (SELECT 1 FROM calculated);

-- name: MaterializeLeaderboardGuildClearSubject :exec
WITH scoped AS MATERIALIZED (
    SELECT * FROM leaderboard_guild_clear_observations WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND realm_id = @realm_id::uuid
      AND guild_id = @guild_id::uuid
), ranked AS (
    SELECT *, row_number() OVER (ORDER BY duration_ms DESC, run_id) AS position,
           count(*) OVER () AS observations
    FROM scoped
), statistics AS (
    SELECT count(*)::bigint AS observation_count,
           min(duration_ms) AS fastest_duration_ms,
           COALESCE(avg(1.0::double precision / duration_ms) FILTER (WHERE position > observations * 2 / 5 AND position < observations), 0)::double precision AS form_mean_inverse_ms,
           COALESCE(avg(1.0::double precision / duration_ms) FILTER (WHERE position > observations / 5 AND position <= observations * 2 / 5), 0)::double precision AS floor_mean_inverse_ms
    FROM ranked HAVING count(*) > 0
), calculated AS (SELECT * FROM statistics), written AS (
    INSERT INTO leaderboard_guild_clear_subjects (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id, observation_count, fastest_duration_ms, form_mean_inverse_ms, floor_mean_inverse_ms, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @realm_id::uuid, @guild_id::uuid, observation_count, fastest_duration_ms, form_mean_inverse_ms, floor_mean_inverse_ms, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id) DO UPDATE SET
        observation_count = EXCLUDED.observation_count,
        fastest_duration_ms = EXCLUDED.fastest_duration_ms,
        form_mean_inverse_ms = EXCLUDED.form_mean_inverse_ms,
        floor_mean_inverse_ms = EXCLUDED.floor_mean_inverse_ms,
        projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version,
        computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_guild_clear_subjects
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND realm_id = @realm_id::uuid
      AND guild_id = @guild_id::uuid
  AND NOT EXISTS (SELECT 1 FROM calculated);

-- name: MaterializeLeaderboardPlayerRenownCount :exec
WITH calculated AS (
    SELECT count(*)::bigint AS kill_count FROM leaderboard_player_renown_facts
    WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND realm_id = @realm_id::uuid
      AND player_guid = @player_guid::text
    HAVING count(*) > 0
), written AS (
    INSERT INTO leaderboard_player_renown_counts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid, kill_count, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @realm_id::uuid, @player_guid::text, kill_count, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid) DO UPDATE SET
        kill_count = EXCLUDED.kill_count, projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version, computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_player_renown_counts
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND realm_id = @realm_id::uuid
      AND player_guid = @player_guid::text
  AND NOT EXISTS (SELECT 1 FROM calculated);

-- name: MaterializeLeaderboardGuildRenownCount :exec
WITH calculated AS (
    SELECT count(*)::bigint AS kill_count FROM leaderboard_guild_renown_facts
    WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND realm_id = @realm_id::uuid
      AND guild_id = @guild_id::uuid
    HAVING count(*) > 0
), written AS (
    INSERT INTO leaderboard_guild_renown_counts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id, kill_count, projection_version, algorithm_version, computed_at)
    SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @realm_id::uuid, @guild_id::uuid, kill_count, @projection_version::integer, @algorithm_version::integer, statement_timestamp() FROM calculated
    ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET
        kill_count = EXCLUDED.kill_count, projection_version = EXCLUDED.projection_version,
        algorithm_version = EXCLUDED.algorithm_version, computed_at = EXCLUDED.computed_at
    RETURNING 1
)
DELETE FROM leaderboard_guild_renown_counts
WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
      AND encounter_name = @encounter_name::text
      AND realm_id = @realm_id::uuid
      AND guild_id = @guild_id::uuid
  AND NOT EXISTS (SELECT 1 FROM calculated);
