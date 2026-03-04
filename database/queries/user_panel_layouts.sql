-- name: ListUserPanelLayouts :many
SELECT *
FROM user_panel_layouts
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: GetUserPanelLayoutByTitle :one
SELECT *
FROM user_panel_layouts
WHERE user_id = $1
  AND title_normalized = lower($2);

-- name: UpsertUserPanelLayoutByTitle :one
INSERT INTO user_panel_layouts (
  user_id,
  title,
  icon,
  description,
  payload
)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, title_normalized)
DO UPDATE SET
  title = EXCLUDED.title,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  payload = EXCLUDED.payload,
  updated_at = now()
RETURNING *;

-- name: DeleteUserPanelLayoutByID :execrows
DELETE FROM user_panel_layouts
WHERE user_id = $1
  AND id = $2;
