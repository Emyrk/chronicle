-- Non-serving readers for tenant-wide projections. Do not route public handlers here
-- until the tenant projection writer is activated. realm_ids is display-only;
-- an empty array shows every realm owned by the tenant.

-- name: ListActivePlayerTenantBossScores :many
SELECT score.*
FROM player_tenant_rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.player_class = @player_class
  AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
  AND score.performance_metric = @performance_metric
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActivePlayerTenantScopeScores :many
SELECT score.*
FROM player_tenant_rating_scope_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.player_class = @player_class
  AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
  AND score.performance_metric = @performance_metric
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveGuildTenantBossScores :many
SELECT score.*
FROM guild_tenant_rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
ORDER BY score.score DESC, score.realm_id, score.guild_id
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveGuildTenantScopeScores :many
SELECT score.*
FROM guild_tenant_rating_scope_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
ORDER BY score.score DESC, score.realm_id, score.guild_id
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);
