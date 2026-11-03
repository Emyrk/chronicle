-- Frozen staged subject keys with eligible locked parses. Membership and boss eligibility
-- are checked against the frozen manifest by the orchestrator.
-- name: ListRatingMasteryPlayerKeys :many
SELECT DISTINCT realm_id, player_guid, instance_name, encounter_name,
       difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric
FROM rating_stage_player_observations
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND locked_parse BETWEEN 0 AND 100 AND killed_at < @as_of::timestamptz
  AND (realm_id, player_guid, instance_name, encounter_name, difficulty_name,
       max_players, player_class, player_spec, player_sub_spec, performance_metric) >
      (@after_realm_id::uuid, @after_player_guid::text, @after_instance_name::text,
       @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint,
       @after_player_class::text, @after_player_spec::text, @after_player_sub_spec::text,
       @after_performance_metric::text)
ORDER BY realm_id, player_guid, instance_name, encounter_name, difficulty_name,
         max_players, player_class, player_spec, player_sub_spec, performance_metric
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);


-- name: ListRatingMasteryGuildKeys :many
SELECT DISTINCT realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players
FROM rating_stage_guild_observations
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND locked_parse BETWEEN 0 AND 100 AND killed_at < @as_of::timestamptz AND guild_id IS NOT NULL
  AND (realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players) >
      (@after_realm_id::uuid, @after_guild_id::uuid, @after_instance_name::text,
       @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint)
ORDER BY realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);
