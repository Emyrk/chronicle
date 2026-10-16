-- name: GetUserMapControls :one
SELECT *
FROM user_map_controls
WHERE user_id = @user_id;

-- name: UpsertUserMapControls :one
INSERT INTO user_map_controls (user_id, controls)
VALUES (@user_id, @controls::jsonb)
ON CONFLICT (user_id) DO UPDATE
SET controls = EXCLUDED.controls,
    updated_at = NOW()
RETURNING *;

-- name: DeleteUserMapControls :exec
DELETE FROM user_map_controls
WHERE user_id = @user_id;
