-- Immutable, generation-local writes. A replay does not change a previously
-- projected score. Lock the building generation against concurrent activation
-- or retirement while selecting the tenant-owned realm and subject.

-- name: InsertPlayerTenantBossScore :execrows
INSERT INTO player_tenant_rating_boss_scores (
    generation_id, tenant_id, realm_id, player_guid, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills, best_duration_secs
)
SELECT generation.id, generation.tenant_id, realm.id, @player_guid, @instance_name, @encounter_name, @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec, @performance_metric, @rating_metric, @window_kind, @window_start, @window_end, @score, @best_raw, @rank_one_raw, @best_locked_parse, @form, @floor_score, @eligible_kills, @best_duration_secs::double precision
FROM rating_score_generations generation
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE generation.id = @generation_id AND generation.tenant_id = @tenant_id
  AND generation.status = 'building' AND @player_guid::text <> ''
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
FOR SHARE OF generation
ON CONFLICT DO NOTHING;

-- name: InsertPlayerTenantScopeScore :execrows
INSERT INTO player_tenant_rating_scope_scores (
    generation_id, tenant_id, realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, best_raw, best_duration_secs
)
SELECT generation.id, generation.tenant_id, realm.id, @player_guid, @instance_name, @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec, @performance_metric, @rating_metric, @window_kind, @window_start, @window_end, @score, @best_raw::double precision, @best_duration_secs::double precision
FROM rating_score_generations generation
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE generation.id = @generation_id AND generation.tenant_id = @tenant_id
  AND generation.status = 'building' AND @player_guid::text <> ''
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
FOR SHARE OF generation
ON CONFLICT DO NOTHING;

-- name: InsertGuildTenantBossScore :execrows
INSERT INTO guild_tenant_rating_boss_scores (
    generation_id, tenant_id, realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills
)
SELECT generation.id, generation.tenant_id, realm.id, guild.id, @instance_name, @encounter_name, @difficulty_name, @max_players, @rating_metric, @window_kind, @window_start, @window_end, @score, @best_raw, @rank_one_raw, @best_locked_parse, @form, @floor_score, @eligible_kills
FROM rating_score_generations generation
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE generation.id = @generation_id AND generation.tenant_id = @tenant_id
  AND generation.status = 'building'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
FOR SHARE OF generation
ON CONFLICT DO NOTHING;

-- name: InsertGuildTenantScopeScore :execrows
INSERT INTO guild_tenant_rating_scope_scores (
    generation_id, tenant_id, realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score
)
SELECT generation.id, generation.tenant_id, realm.id, guild.id, @instance_name, @difficulty_name, @max_players, @rating_metric, @window_kind, @window_start, @window_end, @score
FROM rating_score_generations generation
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE generation.id = @generation_id AND generation.tenant_id = @tenant_id
  AND generation.status = 'building'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
FOR SHARE OF generation
ON CONFLICT DO NOTHING;
