-- Serialize page workers for one generation and reject retired/active or
-- legacy group checkpoints before any projection writes. Configuration changes
-- remain fenced by the revision check in the same transaction.
-- name: GetBuildingTenantProjectionCheckpoint :one
SELECT cp.* FROM rating_rebuild_checkpoints cp
JOIN rating_score_generations gen ON gen.id = cp.generation_id
  AND gen.tenant_id = cp.tenant_id AND gen.status = 'building'
WHERE cp.tenant_id = @tenant_id AND cp.generation_id = @generation_id
  AND cp.manifest->>'writer' = 'tenant'
FOR UPDATE OF cp;

-- One subject/raid/cohort/window per checkpoint page, never mix realms or
-- specializations. The source primary key starts with generation and tenant.
-- name: ListTenantPlayerRaidScopeKeys :many
SELECT DISTINCT realm_id, player_guid, instance_name, difficulty_name, max_players,
       player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind
FROM player_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND (realm_id, player_guid, instance_name, difficulty_name, max_players,
       player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind) >
      (@after_realm_id::uuid, @after_player_guid::text, @after_instance_name::text,
       @after_difficulty_name::text, @after_max_players::smallint, @after_player_class::text,
       @after_player_spec::text, @after_player_sub_spec::text, @after_performance_metric::text,
       @after_rating_metric::text, @after_window_kind::text)
ORDER BY realm_id, player_guid, instance_name, difficulty_name, max_players,
         player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind
LIMIT LEAST(GREATEST(@batch_size::int, 0), 16);

-- name: ListTenantGuildRaidScopeKeys :many
SELECT DISTINCT realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind
FROM guild_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND (realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind) >
      (@after_realm_id::uuid, @after_guild_id::uuid, @after_instance_name::text,
       @after_difficulty_name::text, @after_max_players::smallint, @after_rating_metric::text, @after_window_kind::text)
ORDER BY realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind
LIMIT LEAST(GREATEST(@batch_size::int, 0), 16);

-- name: ListTenantPlayerRaidBosses :many
SELECT encounter_name, score FROM player_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id AND realm_id = @realm_id
  AND player_guid = @player_guid AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND rating_metric = @rating_metric AND window_kind = @window_kind
ORDER BY encounter_name LIMIT 201;

-- name: ListTenantGuildRaidBosses :many
SELECT encounter_name, score FROM guild_tenant_rating_boss_scores
WHERE generation_id = @generation_id AND tenant_id = @tenant_id AND realm_id = @realm_id
  AND guild_id = @guild_id AND instance_name = @instance_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric = @rating_metric AND window_kind = @window_kind
ORDER BY encounter_name LIMIT 201;
