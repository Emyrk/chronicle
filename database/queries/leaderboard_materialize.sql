-- Single maintained calculation source. Compute returns one typed record even
-- for empty evidence. Workers buffer at most 100 records, then publish in a
-- separate SHORT transaction. Never hold dirty-row locks while sorting history.
-- Compatibility singleton wrappers explicitly opt into unfenced manual writes;
-- worker publication must use ownership fencing and never sets manual=true.

-- name: ComputeLeaderboardPlayerBossBenchmark :batchone
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
)
SELECT COALESCE(c.best_metric, 0)::double precision AS best_metric,
       (c.best_metric IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardPlayerBossBenchmark :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_player_boss_benchmarks d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint AND d.encounter_name = @encounter_name::text AND d.player_class = @player_class::text AND d.player_spec = @player_spec::text AND d.player_sub_spec = @player_sub_spec::text AND d.metric = @metric::text
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_player_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, best_metric, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @player_class::text, @player_spec::text, @player_sub_spec::text, @metric::text, @best_metric::double precision, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric) DO UPDATE SET
 best_metric = EXCLUDED.best_metric,
 projection_version = EXCLUDED.projection_version,
 algorithm_version = EXCLUDED.algorithm_version,
 computed_at = EXCLUDED.computed_at
 RETURNING 1
), erased AS (
 DELETE FROM leaderboard_player_boss_benchmarks WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND player_class = @player_class::text AND player_spec = @player_spec::text AND player_sub_spec = @player_sub_spec::text AND metric = @metric::text
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_player_boss_benchmarks d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.player_class = l.player_class AND d.player_spec = l.player_spec AND d.player_sub_spec = l.player_sub_spec AND d.metric = l.metric AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_player_boss_benchmarks d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.player_class = l.player_class AND d.player_spec = l.player_spec AND d.player_sub_spec = l.player_sub_spec AND d.metric = l.metric AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: ComputeLeaderboardPlayerBossSubject :batchone
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
)
SELECT COALESCE(c.observation_count, 0)::bigint AS observation_count, COALESCE(c.raw_peak, 0)::double precision AS raw_peak, COALESCE(c.raw_form, 0)::double precision AS raw_form, COALESCE(c.raw_floor, 0)::double precision AS raw_floor, c.peak_encounter_id, c.peak_duration_ms,
       (c.observation_count IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardPlayerBossSubject :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_player_boss_subjects d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint AND d.encounter_name = @encounter_name::text AND d.player_class = @player_class::text AND d.player_spec = @player_spec::text AND d.player_sub_spec = @player_sub_spec::text AND d.metric = @metric::text AND d.realm_id = @realm_id::uuid AND d.player_guid = @player_guid::text
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_player_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid, observation_count, raw_peak, raw_form, raw_floor, peak_encounter_id, peak_duration_ms, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @player_class::text, @player_spec::text, @player_sub_spec::text, @metric::text, @realm_id::uuid, @player_guid::text, @observation_count::bigint, @raw_peak::double precision, @raw_form::double precision, @raw_floor::double precision, sqlc.narg(peak_encounter_id)::uuid, sqlc.narg(peak_duration_ms)::bigint, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
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
), erased AS (
 DELETE FROM leaderboard_player_boss_subjects WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND player_class = @player_class::text AND player_spec = @player_spec::text AND player_sub_spec = @player_sub_spec::text AND metric = @metric::text AND realm_id = @realm_id::uuid AND player_guid = @player_guid::text
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_player_boss_subjects d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.player_class = l.player_class AND d.player_spec = l.player_spec AND d.player_sub_spec = l.player_sub_spec AND d.metric = l.metric AND d.realm_id = l.realm_id AND d.player_guid = l.player_guid AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_player_boss_subjects d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.player_class = l.player_class AND d.player_spec = l.player_spec AND d.player_sub_spec = l.player_sub_spec AND d.metric = l.metric AND d.realm_id = l.realm_id AND d.player_guid = l.player_guid AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: ComputeLeaderboardGuildBossBenchmark :batchone
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
)
SELECT COALESCE(c.best_duration_ms, 0)::bigint AS best_duration_ms,
       (c.best_duration_ms IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardGuildBossBenchmark :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_guild_boss_benchmarks d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint AND d.encounter_name = @encounter_name::text
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_guild_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, best_duration_ms, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @best_duration_ms::bigint, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name) DO UPDATE SET
 best_duration_ms = EXCLUDED.best_duration_ms,
 projection_version = EXCLUDED.projection_version,
 algorithm_version = EXCLUDED.algorithm_version,
 computed_at = EXCLUDED.computed_at
 RETURNING 1
), erased AS (
 DELETE FROM leaderboard_guild_boss_benchmarks WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_guild_boss_benchmarks d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_guild_boss_benchmarks d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: ComputeLeaderboardGuildBossSubject :batchone
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
), calculated AS (SELECT * FROM statistics)
SELECT COALESCE(c.observation_count, 0)::bigint AS observation_count, COALESCE(c.fastest_duration_ms, 0)::bigint AS fastest_duration_ms, COALESCE(c.form_mean_inverse_ms, 0)::double precision AS form_mean_inverse_ms, COALESCE(c.floor_mean_inverse_ms, 0)::double precision AS floor_mean_inverse_ms,
       (c.observation_count IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardGuildBossSubject :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_guild_boss_subjects d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint AND d.encounter_name = @encounter_name::text AND d.realm_id = @realm_id::uuid AND d.guild_id = @guild_id::uuid
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_guild_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id, observation_count, fastest_duration_ms, form_mean_inverse_ms, floor_mean_inverse_ms, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @realm_id::uuid, @guild_id::uuid, @observation_count::bigint, @fastest_duration_ms::bigint, @form_mean_inverse_ms::double precision, @floor_mean_inverse_ms::double precision, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET
 observation_count = EXCLUDED.observation_count,
 fastest_duration_ms = EXCLUDED.fastest_duration_ms,
 form_mean_inverse_ms = EXCLUDED.form_mean_inverse_ms,
 floor_mean_inverse_ms = EXCLUDED.floor_mean_inverse_ms,
 projection_version = EXCLUDED.projection_version,
 algorithm_version = EXCLUDED.algorithm_version,
 computed_at = EXCLUDED.computed_at
 RETURNING 1
), erased AS (
 DELETE FROM leaderboard_guild_boss_subjects WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND realm_id = @realm_id::uuid AND guild_id = @guild_id::uuid
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_guild_boss_subjects d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.realm_id = l.realm_id AND d.guild_id = l.guild_id AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_guild_boss_subjects d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.realm_id = l.realm_id AND d.guild_id = l.guild_id AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: ComputeLeaderboardGuildClearBenchmark :batchone
WITH calculated AS (
    SELECT duration_ms AS best_duration_ms
    FROM leaderboard_guild_clear_observations
    WHERE tenant_id = @tenant_id::uuid
      AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text
      AND max_players = @max_players::smallint
    ORDER BY duration_ms ASC
    LIMIT 1
)
SELECT COALESCE(c.best_duration_ms, 0)::bigint AS best_duration_ms,
       (c.best_duration_ms IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardGuildClearBenchmark :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_guild_clear_benchmarks d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_guild_clear_benchmarks (tenant_id, instance_name, difficulty_name, max_players, best_duration_ms, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @best_duration_ms::bigint, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players) DO UPDATE SET
 best_duration_ms = EXCLUDED.best_duration_ms,
 projection_version = EXCLUDED.projection_version,
 algorithm_version = EXCLUDED.algorithm_version,
 computed_at = EXCLUDED.computed_at
 RETURNING 1
), erased AS (
 DELETE FROM leaderboard_guild_clear_benchmarks WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_guild_clear_benchmarks d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_guild_clear_benchmarks d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: ComputeLeaderboardGuildClearSubject :batchone
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
), calculated AS (SELECT * FROM statistics)
SELECT COALESCE(c.observation_count, 0)::bigint AS observation_count, COALESCE(c.fastest_duration_ms, 0)::bigint AS fastest_duration_ms, COALESCE(c.form_mean_inverse_ms, 0)::double precision AS form_mean_inverse_ms, COALESCE(c.floor_mean_inverse_ms, 0)::double precision AS floor_mean_inverse_ms,
       (c.observation_count IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardGuildClearSubject :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_guild_clear_subjects d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint AND d.realm_id = @realm_id::uuid AND d.guild_id = @guild_id::uuid
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_guild_clear_subjects (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id, observation_count, fastest_duration_ms, form_mean_inverse_ms, floor_mean_inverse_ms, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @realm_id::uuid, @guild_id::uuid, @observation_count::bigint, @fastest_duration_ms::bigint, @form_mean_inverse_ms::double precision, @floor_mean_inverse_ms::double precision, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id) DO UPDATE SET
 observation_count = EXCLUDED.observation_count,
 fastest_duration_ms = EXCLUDED.fastest_duration_ms,
 form_mean_inverse_ms = EXCLUDED.form_mean_inverse_ms,
 floor_mean_inverse_ms = EXCLUDED.floor_mean_inverse_ms,
 projection_version = EXCLUDED.projection_version,
 algorithm_version = EXCLUDED.algorithm_version,
 computed_at = EXCLUDED.computed_at
 RETURNING 1
), erased AS (
 DELETE FROM leaderboard_guild_clear_subjects WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND realm_id = @realm_id::uuid AND guild_id = @guild_id::uuid
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_guild_clear_subjects d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.realm_id = l.realm_id AND d.guild_id = l.guild_id AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_guild_clear_subjects d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.realm_id = l.realm_id AND d.guild_id = l.guild_id AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: ComputeLeaderboardPlayerRenownCount :batchone
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
)
SELECT COALESCE(c.kill_count, 0)::bigint AS kill_count,
       (c.kill_count IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardPlayerRenownCount :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_player_renown d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint AND d.encounter_name = @encounter_name::text AND d.realm_id = @realm_id::uuid AND d.player_guid = @player_guid::text
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_player_renown_counts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid, kill_count, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @realm_id::uuid, @player_guid::text, @kill_count::bigint, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid) DO UPDATE SET
 kill_count = EXCLUDED.kill_count,
 projection_version = EXCLUDED.projection_version,
 algorithm_version = EXCLUDED.algorithm_version,
 computed_at = EXCLUDED.computed_at
 RETURNING 1
), erased AS (
 DELETE FROM leaderboard_player_renown_counts WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND realm_id = @realm_id::uuid AND player_guid = @player_guid::text
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_player_renown d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.realm_id = l.realm_id AND d.player_guid = l.player_guid AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_player_renown d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.realm_id = l.realm_id AND d.player_guid = l.player_guid AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: ComputeLeaderboardGuildRenownCount :batchone
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
)
SELECT COALESCE(c.kill_count, 0)::bigint AS kill_count,
       (c.kill_count IS NOT NULL)::boolean AS has_evidence
FROM (SELECT 1) singleton LEFT JOIN calculated c ON true;

-- name: PublishLeaderboardGuildRenownCount :batchone
WITH locked AS MATERIALIZED (
 SELECT d.* FROM leaderboard_dirty_guild_renown d
 WHERE d.tenant_id = @tenant_id::uuid AND d.instance_name = @instance_name::text AND d.difficulty_name = @difficulty_name::text AND d.max_players = @max_players::smallint AND d.encounter_name = @encounter_name::text AND d.realm_id = @realm_id::uuid AND d.guild_id = @guild_id::uuid
   AND d.claim_token = @claim_token::uuid AND d.claimed_revision = @claimed_revision::bigint
   AND d.locked_until > clock_timestamp()
 FOR UPDATE
), allowed AS MATERIALIZED (
 SELECT 1 FROM locked WHERE locked_until > clock_timestamp()
 UNION ALL SELECT 1 WHERE @unfenced_manual::boolean
), written AS (
 INSERT INTO leaderboard_guild_renown_counts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id, kill_count, projection_version, algorithm_version, computed_at)
 SELECT @tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @realm_id::uuid, @guild_id::uuid, @kill_count::bigint, @projection_version::integer, @algorithm_version::integer, statement_timestamp()
 WHERE @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET
 kill_count = EXCLUDED.kill_count,
 projection_version = EXCLUDED.projection_version,
 algorithm_version = EXCLUDED.algorithm_version,
 computed_at = EXCLUDED.computed_at
 RETURNING 1
), erased AS (
 DELETE FROM leaderboard_guild_renown_counts WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND realm_id = @realm_id::uuid AND guild_id = @guild_id::uuid
 AND NOT @has_evidence::boolean AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), acknowledged AS (
 DELETE FROM leaderboard_dirty_guild_renown d USING locked l
 WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.realm_id = l.realm_id AND d.guild_id = l.guild_id AND l.revision = l.claimed_revision
   AND EXISTS (SELECT 1 FROM allowed)
 RETURNING 1
), released AS (
UPDATE leaderboard_dirty_guild_renown d
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = 0, retry_after = '-infinity'
FROM locked l
WHERE d.tenant_id = l.tenant_id AND d.instance_name = l.instance_name AND d.difficulty_name = l.difficulty_name AND d.max_players = l.max_players AND d.encounter_name = l.encounter_name AND d.realm_id = l.realm_id AND d.guild_id = l.guild_id AND l.revision <> l.claimed_revision
  AND EXISTS (SELECT 1 FROM allowed) RETURNING 1
)
SELECT EXISTS(SELECT 1 FROM allowed)::boolean AS published;

-- name: LeaderboardD2Clock :one
-- Shared database clock for operational diagnostics; leases never use Go time.
SELECT clock_timestamp()::timestamptz;
