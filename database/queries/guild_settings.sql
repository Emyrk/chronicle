-- Guild Settings

-- name: GetGuildSettings :one
SELECT * FROM guild_settings WHERE guild_id = $1;

-- name: UpsertGuildSettings :one
INSERT INTO guild_settings (guild_id, allow_join_requests, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (guild_id) DO UPDATE SET
    allow_join_requests = $2, updated_at = NOW()
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
