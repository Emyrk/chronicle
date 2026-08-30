-- name: InsertUserAPIKey :one
INSERT INTO user_api_keys (id, user_id, name, key_hash, created_at)
VALUES (@id, @user_id, @name, @key_hash, @created_at)
RETURNING *;

-- name: GetUserAPIKeyByHash :one
SELECT *
FROM user_api_keys
WHERE key_hash = @key_hash;

-- name: ListUserAPIKeys :many
SELECT *
FROM user_api_keys
WHERE user_id = @user_id
ORDER BY created_at DESC;

-- name: DeleteUserAPIKey :execrows
DELETE FROM user_api_keys
WHERE id = @id AND user_id = @user_id;

-- name: TouchUserAPIKeyLastUsed :exec
UPDATE user_api_keys
SET last_used_at = @last_used_at
WHERE id = @id
  AND (last_used_at IS NULL OR last_used_at < @last_used_before);

-- name: CountUserAPIKeys :one
SELECT COUNT(*)
FROM user_api_keys
WHERE user_id = @user_id;
