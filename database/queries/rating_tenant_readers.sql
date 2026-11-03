-- Published tenant-wide projection readers. realm_ids is display-only;
-- an empty array shows every realm owned by the tenant.
-- Pass zero generation_id and zero after_realm_id on the first page. Continue
-- with the returned generation_id and the last row's (score, realm_id,
-- player_guid/guild_id). Retired generations can be deleted with CASCADE, so
-- continuation is active-only: callers must compare the cursor generation
-- with the active tenant generation and report stale cursor on mismatch.
-- Never restart at a new generation using an old position.

-- name: GetActiveTenantRatingGeneration :one
-- Compare this ID with a continuation cursor before reading; a mismatch or
-- no active generation means the cursor is stale, not an empty leaderboard.
SELECT id FROM rating_score_generations
WHERE tenant_id = @tenant_id AND status = 'active';

-- name: ListActivePlayerTenantBossScores :many
SELECT score.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
FROM player_tenant_rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
-- Keep the indexed wow_guid column uncast. Non-GUID historical score text
-- must safely miss the optional identity join rather than fail the board.
LEFT JOIN game_players gp ON gp.realm_id = score.realm_id AND gp.id = (CASE WHEN score.player_guid ~ '^0x[0-9A-Fa-f]{16}$'
     THEN score.player_guid::wow_guid ELSE NULL::wow_guid END)
LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
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
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.player_guid > @after_player_guid::text))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActivePlayerTenantScopeScores :many
SELECT score.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
FROM player_tenant_rating_scope_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
LEFT JOIN game_players gp ON gp.realm_id = score.realm_id AND gp.id = (CASE WHEN score.player_guid ~ '^0x[0-9A-Fa-f]{16}$'
     THEN score.player_guid::wow_guid ELSE NULL::wow_guid END)
LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
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
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.player_guid > @after_player_guid::text))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveGuildTenantBossScores :many
SELECT score.*, guild.name AS guild_name, realm.name AS realm_name
FROM guild_tenant_rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
LEFT JOIN guilds guild ON guild.id = score.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.guild_id > @after_guild_id::uuid))
ORDER BY score.score DESC, score.realm_id, score.guild_id
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveGuildTenantScopeScores :many
SELECT score.*, guild.name AS guild_name, realm.name AS realm_name
FROM guild_tenant_rating_scope_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
LEFT JOIN guilds guild ON guild.id = score.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.guild_id > @after_guild_id::uuid))
ORDER BY score.score DESC, score.realm_id, score.guild_id
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);
