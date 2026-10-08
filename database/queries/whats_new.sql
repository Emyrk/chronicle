-- name: GetUserWhatsNewState :one
SELECT *
FROM user_whats_new_state
WHERE user_id = @user_id;

-- name: InitializeUserWhatsNewState :one
INSERT INTO user_whats_new_state (user_id, seen_id)
VALUES (@user_id, @seen_id)
ON CONFLICT (user_id) DO NOTHING
RETURNING *;

-- name: MarkWhatsNewRead :one
INSERT INTO user_whats_new_state (user_id, seen_id)
VALUES (@user_id, @seen_id)
ON CONFLICT (user_id) DO UPDATE
SET seen_id = EXCLUDED.seen_id,
    seen_at = NOW()
RETURNING *;
