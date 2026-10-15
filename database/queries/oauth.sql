-- name: GetOrCreateOAuthServerSecret :one
INSERT INTO oauth_server_secrets (id, secret)
VALUES (TRUE, @secret)
ON CONFLICT (id) DO UPDATE SET id = oauth_server_secrets.id
RETURNING secret;

-- name: CreateOAuthDeviceSession :exec
INSERT INTO oauth_device_sessions (device_signature, user_signature, request)
VALUES (@device_signature, @user_signature, @request);

-- name: GetOAuthDeviceSession :one
SELECT device_signature, user_signature, request, invalidated
FROM oauth_device_sessions
WHERE device_signature = @signature OR user_signature = @signature;

-- name: UpdateOAuthDeviceSessionByUserSignature :one
UPDATE oauth_device_sessions
SET request = @request
WHERE user_signature = @user_signature AND NOT invalidated
RETURNING device_signature;

-- name: InvalidateOAuthDeviceSession :exec
UPDATE oauth_device_sessions
SET invalidated = TRUE
WHERE device_signature = @device_signature;

-- name: CreateOAuthTokenSession :exec
INSERT INTO oauth_token_sessions (
  token_type,
  signature,
  request_id,
  access_signature,
  request
) VALUES (
  @token_type,
  @signature,
  @request_id,
  @access_signature,
  @request
);

-- name: GetOAuthTokenSession :one
SELECT request
FROM oauth_token_sessions
WHERE token_type = @token_type AND signature = @signature;

-- name: DeleteOAuthTokenSession :exec
DELETE FROM oauth_token_sessions
WHERE token_type = @token_type AND signature = @signature;

-- name: RevokeOAuthTokenSessions :execrows
DELETE FROM oauth_token_sessions
WHERE request_id = @request_id AND token_type = @token_type;

-- name: RotateOAuthRefreshToken :exec
DELETE FROM oauth_token_sessions
WHERE request_id = @request_id
  AND (
    token_type = 'access'
    OR (token_type = 'refresh' AND signature = @refresh_signature)
  );
