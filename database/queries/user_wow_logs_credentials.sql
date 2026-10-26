-- name: GetUserWoWLogsCredential :one
SELECT * FROM user_wow_logs_credentials WHERE user_id = @user_id;

-- name: UpsertUserWoWLogsCredential :one
INSERT INTO user_wow_logs_credentials (user_id, encrypted_token, credential_key_version)
VALUES (@user_id, @encrypted_token, @credential_key_version)
ON CONFLICT (user_id) DO UPDATE SET
    encrypted_token = EXCLUDED.encrypted_token,
    credential_key_version = EXCLUDED.credential_key_version,
    updated_at = now()
RETURNING *;

-- name: DeleteUserWoWLogsCredential :exec
DELETE FROM user_wow_logs_credentials WHERE user_id = @user_id;
