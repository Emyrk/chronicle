-- name: InsertAIKey :one
INSERT INTO ai_keys (id, user_id, tenant_id, hashed_secret, private_data, expires_at)
VALUES (@id, @user_id, @tenant_id, @hashed_secret, @private_data, @expires_at)
RETURNING *;

-- name: GetUnrevokedAIKey :one
-- The user's current key in a community, which may have expired.
SELECT * FROM ai_keys
WHERE user_id = @user_id AND tenant_scope_id = @tenant_scope_id AND revoked_at IS NULL;

-- name: RevokeAIKeys :execrows
-- Revokes the user's unrevoked key in a community.
UPDATE ai_keys SET revoked_at = NOW()
WHERE user_id = @user_id AND tenant_scope_id = @tenant_scope_id AND revoked_at IS NULL;

-- name: GetAIKeyByHashedSecret :one
SELECT * FROM ai_keys WHERE hashed_secret = @hashed_secret;

-- name: TouchAIKey :exec
-- Records an accepted request.
UPDATE ai_keys SET
  last_used_at = NOW(),
  last_user_agent = @last_user_agent,
  request_count = request_count + 1
WHERE id = @id;
