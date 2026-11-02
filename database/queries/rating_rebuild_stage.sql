-- Only a bounded page is passed to each insertion. Caller advances the
-- checkpoint cursor in the same transaction. ON CONFLICT never rewrites the
-- original evidence if a page is replayed after a crash.
-- name: StageRatingPlayerRuns :one
WITH source AS (
    SELECT rr.realm_id, rr.run_id, ranking.player_guid, ranking.instance_name,
           ranking.encounter_name, ranking.difficulty_name, ranking.max_players,
           ranking.player_class, ranking.player_spec, ranking.player_sub_spec,
           ranking.killed_at, @metric::text AS performance_metric,
           CASE WHEN @metric::text = 'hps' THEN ranking.hps ELSE ranking.dps END AS raw_value,
           locked.precise_score AS locked_parse
    FROM ranking_runs rr
    JOIN wow_server_realms realm ON realm.id = rr.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    JOIN log_instances representative ON representative.id = rr.representative_instance_id
    JOIN wow_log_groups log_group ON log_group.id = representative.log_group_id AND NOT log_group.unlisted
    JOIN encounter_dps_rankings ranking ON ranking.instance_id = representative.id
    LEFT JOIN LATERAL (
        SELECT psr.precise_score FROM parse_score_results psr
        JOIN log_instances scored_instance ON scored_instance.id = psr.instance_id
        JOIN wow_log_groups scored_group ON scored_group.id = scored_instance.log_group_id AND NOT scored_group.unlisted
        WHERE psr.tenant_id = @tenant_id AND psr.created_at <= @source_cutoff AND psr.run_id = rr.run_id
          AND psr.encounter_name = ranking.encounter_name AND psr.player_guid = ranking.player_guid
          AND psr.instance_name = ranking.instance_name AND psr.difficulty_name = ranking.difficulty_name
          AND psr.max_players = ranking.max_players AND psr.player_class = ranking.player_class
          AND psr.player_spec = ranking.player_spec AND psr.player_sub_spec = ranking.player_sub_spec
          AND psr.metric = @metric::text AND psr.status IN ('ok', 'low_confidence')
        ORDER BY psr.created_at DESC, psr.precise_score DESC, psr.id LIMIT 1
    ) locked ON true
    WHERE rr.run_id = ANY(@run_ids::uuid[]) AND cardinality(@run_ids::uuid[]) <= 200 AND rr.updated_at <= @source_cutoff AND rr.source_updated_at <= @source_cutoff
      AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND representative.invalidated_at IS NULL AND ranking.killed_at <= @source_cutoff AND ranking.encounter_id IS NOT NULL
      AND ranking.duration_secs > 0
      AND @metric::text IN ('dps', 'hps')
      AND (CASE WHEN @metric::text = 'hps' THEN ranking.hps ELSE ranking.dps END) > 0
), inserted AS (
    INSERT INTO rating_stage_player_observations
      (generation_id, tenant_id, realm_id, run_id, player_guid, instance_name, encounter_name,
       difficulty_name, max_players, player_class, player_spec, player_sub_spec, killed_at,
       performance_metric, raw_value, locked_parse)
    SELECT @generation_id, @tenant_id, source.* FROM source
    ON CONFLICT DO NOTHING RETURNING 1
)
SELECT count(*)::bigint FROM inserted;

-- name: StageRatingGuildRuns :one
WITH source AS (
    SELECT DISTINCT ON (rr.run_id, encounter.name)
        rr.realm_id, rr.run_id, representative.guild_id, representative.name AS instance_name,
        encounter.name AS encounter_name, representative.difficulty_name,
        representative.max_players::smallint AS max_players, encounter.end_time AS killed_at,
        (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::double precision AS raw_duration_ms,
        boss.server_precise_score AS locked_parse
    FROM ranking_runs rr
    JOIN wow_server_realms realm ON realm.id = rr.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    JOIN log_instances representative ON representative.id = rr.representative_instance_id
    JOIN wow_log_groups log_group ON log_group.id = representative.log_group_id AND NOT log_group.unlisted
    JOIN log_instance_encounters encounter ON encounter.instance_id = representative.id
    LEFT JOIN LATERAL (
        SELECT b.server_precise_score FROM time_parse_scores score
        JOIN time_parse_boss_scores b ON b.time_parse_score_id = score.id
        JOIN log_instances scored_instance ON scored_instance.id = score.instance_id
        JOIN wow_log_groups scored_group ON scored_group.id = scored_instance.log_group_id AND NOT scored_group.unlisted
        WHERE score.tenant_id = @tenant_id AND score.computed_at <= @source_cutoff AND score.run_id = rr.run_id
          AND score.realm_id = rr.realm_id AND score.guild_id IS NOT DISTINCT FROM representative.guild_id
          AND b.encounter_name = encounter.name AND b.server_status IN ('ok', 'low_confidence')
        ORDER BY score.computed_at DESC, score.id DESC LIMIT 1
    ) boss ON true
    WHERE rr.run_id = ANY(@run_ids::uuid[]) AND cardinality(@run_ids::uuid[]) <= 200 AND rr.updated_at <= @source_cutoff AND rr.source_updated_at <= @source_cutoff
      AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND representative.invalidated_at IS NULL AND encounter.end_time <= @source_cutoff AND encounter.boss = true
      AND encounter.kill_type = 'clean' AND encounter.end_time > encounter.start_time
    ORDER BY rr.run_id, encounter.name,
             (encounter.end_time - encounter.start_time), encounter.end_time, encounter.id
), inserted AS (
    INSERT INTO rating_stage_guild_observations
      (generation_id, tenant_id, realm_id, run_id, guild_id, instance_name, encounter_name,
       difficulty_name, max_players, killed_at, raw_duration_ms, locked_parse)
    SELECT @generation_id, @tenant_id, source.* FROM source
    ON CONFLICT DO NOTHING RETURNING 1
)
SELECT count(*)::bigint FROM inserted;

-- Tenant realms are a small configuration set; page independently within each
-- realm using the existing source unique keys (no startup index/backfill).
-- name: ListRatingStageRealms :many
SELECT realm.id FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND realm.id > @after_realm_id
ORDER BY realm.id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingPlayerRenownSourcePage :many
SELECT fact.* FROM renown_kill_facts fact
WHERE fact.realm_id = @realm_id
  AND (fact.player_guid, fact.run_id, fact.encounter_name) >
      (@after_player_guid::text, @after_run_id::uuid, @after_encounter_name::text)
  AND fact.recorded_at <= @source_cutoff
ORDER BY fact.player_guid, fact.run_id, fact.encounter_name
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingGuildRenownSourcePage :many
SELECT fact.* FROM guild_renown_kill_facts fact
WHERE fact.tenant_id = @tenant_id AND fact.realm_id = @realm_id
  AND (fact.guild_id, fact.run_id, fact.encounter_name) >
      (@after_guild_id::uuid, @after_run_id::uuid, @after_encounter_name::text)
  AND fact.recorded_at <= @source_cutoff
ORDER BY fact.guild_id, fact.run_id, fact.encounter_name
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: StageRatingPlayerRenownPage :one
WITH inserted AS (
    INSERT INTO rating_stage_player_renown
      (generation_id, tenant_id, realm_id, player_guid, run_id, instance_name, encounter_name, killed_at, source_id)
    SELECT @generation_id, @tenant_id, fact.realm_id, fact.player_guid, fact.run_id,
           fact.instance_name, fact.encounter_name, fact.killed_at, fact.id
    FROM renown_kill_facts fact
    WHERE fact.realm_id = @realm_id
      AND (fact.player_guid, fact.run_id, fact.encounter_name) >
          (@after_player_guid::text, @after_run_id::uuid, @after_encounter_name::text)
      AND fact.recorded_at <= @source_cutoff
    ORDER BY fact.player_guid, fact.run_id, fact.encounter_name
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
    ON CONFLICT DO NOTHING RETURNING 1
)
SELECT count(*)::bigint FROM inserted;

-- name: StageRatingGuildRenownPage :one
WITH inserted AS (
    INSERT INTO rating_stage_guild_renown
      (generation_id, tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at, source_id)
    SELECT @generation_id, @tenant_id, fact.realm_id, fact.guild_id, fact.run_id,
           fact.instance_name, fact.encounter_name, fact.killed_at, fact.id
    FROM guild_renown_kill_facts fact
    WHERE fact.tenant_id = @tenant_id AND fact.realm_id = @realm_id
      AND (fact.guild_id, fact.run_id, fact.encounter_name) >
          (@after_guild_id::uuid, @after_run_id::uuid, @after_encounter_name::text)
      AND fact.recorded_at <= @source_cutoff
    ORDER BY fact.guild_id, fact.run_id, fact.encounter_name
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
    ON CONFLICT DO NOTHING RETURNING 1
)
SELECT count(*)::bigint FROM inserted;

-- Ordered locked observations support exact Mastery replay and bounded reading.
-- name: ListRatingStagePlayerSubject :many
SELECT * FROM rating_stage_player_observations
WHERE generation_id = @generation_id AND realm_id = @realm_id AND player_guid = @player_guid
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND locked_parse IS NOT NULL AND killed_at >= @period_start
  AND (locked_parse, killed_at, run_id) >
      (@after_locked_parse::double precision, @after_killed_at::timestamptz, @after_run_id::uuid)
ORDER BY locked_parse, killed_at, run_id
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingStageGuildSubject :many
SELECT * FROM rating_stage_guild_observations
WHERE generation_id = @generation_id AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND locked_parse IS NOT NULL AND killed_at >= @period_start
  AND (locked_parse, killed_at, run_id) >
      (@after_locked_parse::double precision, @after_killed_at::timestamptz, @after_run_id::uuid)
ORDER BY locked_parse, killed_at, run_id
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- Rank-one derives from *all* tenant runs (including unassigned realms and
-- guild-less observations); the worker applies frozen membership afterwards.
-- name: RatingStagePlayerRankOne :one
SELECT max(raw_value)::double precision FROM rating_stage_player_observations
WHERE generation_id = @generation_id AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND killed_at >= @period_start;

-- name: RatingStageGuildRankOne :one
SELECT min(raw_duration_ms)::double precision FROM rating_stage_guild_observations
WHERE generation_id = @generation_id AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND killed_at >= @period_start;

-- Enumerate a bounded set of distinct player or guild subjects. The after-key
-- is the last emitted key, not the last raw row in the staging table.
-- name: ListRatingStagePlayerKeys :many
SELECT DISTINCT realm_id, player_guid, instance_name, encounter_name,
       difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric
FROM rating_stage_player_observations
WHERE generation_id = @generation_id
  AND (realm_id, player_guid, instance_name, encounter_name, difficulty_name,
       max_players, player_class, player_spec, player_sub_spec, performance_metric) >
      (@after_realm_id::uuid, @after_player_guid::text, @after_instance_name::text,
       @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint,
       @after_player_class::text, @after_player_spec::text, @after_player_sub_spec::text,
       @after_performance_metric::text)
ORDER BY realm_id, player_guid, instance_name, encounter_name, difficulty_name,
         max_players, player_class, player_spec, player_sub_spec, performance_metric
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingStageGuildKeys :many
SELECT DISTINCT realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players
FROM rating_stage_guild_observations
WHERE generation_id = @generation_id AND guild_id IS NOT NULL
  AND (realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players) >
      (@after_realm_id::uuid, @after_guild_id::uuid, @after_instance_name::text,
       @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint)
ORDER BY realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingStagePlayerRenownKeys :many
SELECT DISTINCT realm_id, player_guid, instance_name, encounter_name
FROM rating_stage_player_renown WHERE generation_id = @generation_id
  AND (realm_id, player_guid, instance_name, encounter_name) >
      (@after_realm_id::uuid, @after_player_guid::text, @after_instance_name::text, @after_encounter_name::text)
ORDER BY realm_id, player_guid, instance_name, encounter_name
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingStageGuildRenownKeys :many
SELECT DISTINCT realm_id, guild_id, instance_name, encounter_name
FROM rating_stage_guild_renown WHERE generation_id = @generation_id
  AND (realm_id, guild_id, instance_name, encounter_name) >
      (@after_realm_id::uuid, @after_guild_id::uuid, @after_instance_name::text, @after_encounter_name::text)
ORDER BY realm_id, guild_id, instance_name, encounter_name
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingStagePlayerRenownSubject :many
SELECT * FROM rating_stage_player_renown
WHERE generation_id = @generation_id AND realm_id = @realm_id AND player_guid = @player_guid
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND (killed_at, source_id) > (@after_killed_at::timestamptz, @after_source_id::uuid)
ORDER BY killed_at, source_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingStageGuildRenownSubject :many
SELECT * FROM rating_stage_guild_renown
WHERE generation_id = @generation_id AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND (killed_at, source_id) > (@after_killed_at::timestamptz, @after_source_id::uuid)
ORDER BY killed_at, source_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingStageRunsForTenant :many
SELECT rr.run_id FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND rr.run_id > @after_run_id AND rr.updated_at <= @source_cutoff
  AND rr.source_updated_at <= @source_cutoff
ORDER BY rr.run_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);
