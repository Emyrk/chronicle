-- Guild Settings

-- name: GetGuildSettings :one
SELECT * FROM guild_settings WHERE guild_id = $1;

-- name: UpsertGuildSettings :one
INSERT INTO guild_settings (guild_id, allow_join_requests_until, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (guild_id) DO UPDATE SET
    allow_join_requests_until = $2, updated_at = NOW()
RETURNING *;

-- Discord Integration

-- name: CreateGuildDiscordInstallState :one
INSERT INTO guild_discord_install_states (state, guild_id, user_id, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ConsumeGuildDiscordInstallState :one
DELETE FROM guild_discord_install_states
WHERE state = $1 AND expires_at > NOW()
RETURNING *;

-- name: GetGuildDiscordInstallation :one
SELECT * FROM guild_discord_installations WHERE guild_id = $1;

-- name: CountGuildDiscordInstallationsByDiscordGuildID :one
SELECT COUNT(*) FROM guild_discord_installations WHERE discord_guild_id = $1;

-- name: UpsertGuildDiscordInstallation :one
INSERT INTO guild_discord_installations (
  guild_id, discord_guild_id, discord_guild_name, installed_by
) VALUES ($1, $2, $3, $4)
ON CONFLICT (guild_id) DO UPDATE SET
  discord_guild_id = EXCLUDED.discord_guild_id,
  discord_guild_name = EXCLUDED.discord_guild_name,
  installed_by = EXCLUDED.installed_by,
  updated_at = NOW()
RETURNING *;

-- name: DeleteGuildDiscordInstallation :one
DELETE FROM guild_discord_installations
WHERE guild_id = $1
RETURNING *;

-- Guild Join Requests

-- name: CreateGuildJoinRequest :one
INSERT INTO guild_join_requests (guild_id, user_id, message)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListGuildJoinRequests :many
SELECT gjr.*, u.username
FROM guild_join_requests gjr
JOIN users u ON u.id = gjr.user_id
WHERE gjr.guild_id = $1
ORDER BY gjr.created_at ASC;

-- name: DeleteGuildJoinRequest :exec
DELETE FROM guild_join_requests WHERE id = $1 AND guild_id = $2;

-- name: GetGuildJoinRequestByUser :one
SELECT * FROM guild_join_requests WHERE guild_id = $1 AND user_id = $2;
