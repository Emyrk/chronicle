-- name: GetOrCreateOAuthServerSecret :one
INSERT INTO oauth_server_secrets (id, secret)
VALUES (TRUE, @secret)
ON CONFLICT (id) DO UPDATE SET id = oauth_server_secrets.id
RETURNING secret;

-- name: CreateOAuthDeviceSession :exec
INSERT INTO oauth_device_sessions (
  device_signature, user_signature, request, expires_at,
  sidekick_installation_id, sidekick_installation_name,
  sidekick_installation_platform, sidekick_installation_version
)
VALUES (
  @device_signature, @user_signature, @request, @expires_at,
  @sidekick_installation_id, @sidekick_installation_name,
  @sidekick_installation_platform, @sidekick_installation_version
);

-- name: GetOAuthDeviceSession :one
SELECT device_signature, user_signature, request, invalidated,
  sidekick_installation_id, sidekick_installation_name,
  sidekick_installation_platform, sidekick_installation_version
FROM oauth_device_sessions
WHERE (device_signature = @signature OR user_signature = @signature)
  AND expires_at > NOW();

-- name: UpdateOAuthDeviceSessionByUserSignature :one
UPDATE oauth_device_sessions
SET request = @request
WHERE user_signature = @user_signature
  AND NOT invalidated
  AND expires_at > NOW()
RETURNING device_signature;

-- name: InvalidateOAuthDeviceSession :execrows
UPDATE oauth_device_sessions
SET invalidated = TRUE
WHERE device_signature = @device_signature
  AND NOT invalidated
  AND expires_at > NOW();

-- name: InvalidateOAuthDeviceSessionsBySidekickInstallationID :execrows
UPDATE oauth_device_sessions
SET invalidated = TRUE
WHERE sidekick_installation_id = @sidekick_installation_id
  AND NOT invalidated
  AND expires_at > NOW();

-- name: DeleteExpiredOAuthDeviceSessions :execrows
DELETE FROM oauth_device_sessions
WHERE expires_at <= NOW();

-- name: CreateOAuthTokenSession :exec
INSERT INTO oauth_token_sessions (
  token_type,
  signature,
  request_id,
  access_signature,
  request,
  expires_at
) VALUES (
  @token_type,
  @signature,
  @request_id,
  @access_signature,
  @request,
  @expires_at
);

-- name: GetOAuthTokenSession :one
SELECT request
FROM oauth_token_sessions
WHERE token_type = @token_type
  AND signature = @signature
  AND expires_at > NOW();

-- name: DeleteOAuthTokenSession :execrows
DELETE FROM oauth_token_sessions
WHERE token_type = @token_type AND signature = @signature;

-- name: DeleteExpiredOAuthTokenSessions :execrows
DELETE FROM oauth_token_sessions
WHERE expires_at <= NOW();

-- name: RevokeOAuthTokenSessions :execrows
DELETE FROM oauth_token_sessions
WHERE request_id = @request_id AND token_type = @token_type;

-- name: DeleteOAuthTokenSessionsByRequestID :execrows
DELETE FROM oauth_token_sessions
WHERE request_id = @request_id;

-- name: RotateOAuthRefreshToken :one
WITH deleted_refresh AS (
  DELETE FROM oauth_token_sessions
  WHERE oauth_token_sessions.request_id = @request_id
    AND oauth_token_sessions.token_type = 'refresh'
    AND oauth_token_sessions.signature = @refresh_signature
    AND expires_at > NOW()
  RETURNING signature, request_id, request, expires_at
), used_refresh AS (
  INSERT INTO oauth_used_refresh_tokens (signature, request_id, request, expires_at)
  SELECT signature, request_id, request, expires_at FROM deleted_refresh
  WHERE request->>'client_id' <> 'chronicle-sidekick'
  RETURNING 1
), deleted_access AS (
  DELETE FROM oauth_token_sessions
  WHERE oauth_token_sessions.request_id = @request_id
    AND oauth_token_sessions.token_type = 'access'
    AND EXISTS (SELECT 1 FROM deleted_refresh)
)
SELECT COUNT(*) FROM deleted_refresh;

-- name: CreateOAuthDeveloperApp :one
INSERT INTO oauth_developer_apps (id, user_id, name, secret_hash)
VALUES (@id, @user_id, @name, @secret_hash)
RETURNING *;

-- name: GetOAuthDeveloperAppByID :one
SELECT * FROM oauth_developer_apps WHERE id = @id;

-- name: GetOAuthDeveloperAppByUser :one
SELECT * FROM oauth_developer_apps WHERE user_id = @user_id;

-- name: DeleteOAuthDeveloperAppByUser :one
DELETE FROM oauth_developer_apps WHERE user_id = @user_id RETURNING id;

-- name: DeleteOAuthDeveloperAppTokens :execrows
DELETE FROM oauth_token_sessions
WHERE request->>'client_id' = 'chronicle-app-' || @app_id::text;

-- name: UpdateOAuthDeveloperAppSecret :execrows
UPDATE oauth_developer_apps SET secret_hash = @secret_hash WHERE user_id = @user_id;

-- name: GetUsedOAuthRefreshToken :one
SELECT request FROM oauth_used_refresh_tokens
WHERE signature = @signature AND expires_at > NOW();

-- name: DeleteExpiredUsedOAuthRefreshTokens :execrows
DELETE FROM oauth_used_refresh_tokens WHERE expires_at <= NOW();
