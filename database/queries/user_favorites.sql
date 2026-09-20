-- name: ListUserFavoriteGuilds :many
SELECT
  g.id,
  g.name,
  g.realm_id,
  r.name AS realm_name,
  COALESCE(gp.theme->>'logo_url', '')::text AS logo_url,
  ufg.created_at
FROM user_favorite_guilds ufg
JOIN guilds g ON g.id = ufg.guild_id
JOIN wow_server_realms r ON r.id = g.realm_id
LEFT JOIN guild_pages gp ON gp.guild_id = g.id
WHERE ufg.user_id = $1
ORDER BY ufg.created_at ASC;

-- name: AddUserFavoriteGuild :exec
INSERT INTO user_favorite_guilds (user_id, guild_id, tenant_id)
SELECT @user_id, g.id, ws.tenant_id
FROM guilds g
JOIN wow_server_realms r ON r.id = g.realm_id
JOIN wow_servers ws ON ws.id = r.server_id
WHERE g.id = @guild_id
ON CONFLICT (user_id, tenant_scope_id) DO UPDATE
SET guild_id = EXCLUDED.guild_id,
    tenant_id = EXCLUDED.tenant_id,
    created_at = NOW();

-- name: DeleteUserFavoriteGuild :exec
DELETE FROM user_favorite_guilds
WHERE user_id = $1 AND guild_id = $2;

-- name: ListUserFavoritePlayers :many
SELECT
  gp.id,
  gp.realm_id,
  r.name AS realm_name,
  gp.name,
  gp.class,
  gp.race,
  gp.gender,
  gp.level,
  gp.guild_id,
  COALESCE(g.name, '') AS guild_name,
  ufp.created_at
FROM user_favorite_players ufp
JOIN game_players gp ON gp.id = ufp.character_guid AND gp.realm_id = ufp.realm_id
JOIN wow_server_realms r ON r.id = gp.realm_id
LEFT JOIN guilds g ON g.id = gp.guild_id
WHERE ufp.user_id = $1
ORDER BY ufp.created_at ASC;

-- name: AddUserFavoritePlayer :exec
INSERT INTO user_favorite_players (user_id, character_guid, realm_id)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, character_guid, realm_id) DO NOTHING;

-- name: DeleteUserFavoritePlayer :exec
DELETE FROM user_favorite_players
WHERE user_id = $1 AND character_guid = $2 AND realm_id = $3;
