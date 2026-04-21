-- name: InsertUserPassword :one
INSERT INTO user_passwords (user_auth_id, password_hash, updated_at)
VALUES (@user_auth_id, @password_hash, @updated_at)
RETURNING *;

-- name: GetUserPasswordByAuthID :one
SELECT * FROM user_passwords WHERE user_auth_id = @user_auth_id;

-- name: UpdateUserPassword :exec
UPDATE user_passwords SET password_hash = @password_hash, updated_at = now()
WHERE user_auth_id = @user_auth_id;

-- name: SetVerificationToken :exec
UPDATE user_passwords
SET verification_token_hash = @verification_token_hash,
    verification_token_expires_at = @verification_token_expires_at,
    verification_token_created_at = now(),
    updated_at = now()
WHERE user_auth_id = @user_auth_id;

-- name: GetUserPasswordByVerificationToken :one
SELECT up.*, ual.linked_id, ual.user_id
FROM user_passwords up
JOIN user_auth_links ual ON ual.id = up.user_auth_id
WHERE up.verification_token_hash = @verification_token_hash
  AND up.verification_token_expires_at > now()
  AND up.email_verified = FALSE;

-- name: MarkEmailVerified :exec
UPDATE user_passwords
SET email_verified = TRUE,
    verification_token_hash = NULL,
    verification_token_expires_at = NULL,
    updated_at = now()
WHERE user_auth_id = @user_auth_id;

-- name: SetResetToken :exec
UPDATE user_passwords
SET reset_token_hash = @reset_token_hash,
    reset_token_expires_at = @reset_token_expires_at,
    reset_token_created_at = now(),
    updated_at = now()
WHERE user_auth_id = @user_auth_id;

-- name: GetUserPasswordByResetToken :one
SELECT up.*, ual.linked_id, ual.user_id
FROM user_passwords up
JOIN user_auth_links ual ON ual.id = up.user_auth_id
WHERE up.reset_token_hash = @reset_token_hash
  AND up.reset_token_expires_at > now();

-- name: ClearResetToken :exec
UPDATE user_passwords
SET reset_token_hash = NULL,
    reset_token_expires_at = NULL,
    updated_at = now()
WHERE user_auth_id = @user_auth_id;


