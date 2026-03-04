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

-- name: CreateUserPanelLayout :one
INSERT INTO user_panel_layouts (
  user_id,
  title,
  icon,
  description,
  payload
)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateUserPanelLayoutByID :one
UPDATE user_panel_layouts
SET
  title = $3,
  icon = $4,
  description = $5,
  payload = $6,
  updated_at = now()
WHERE id = $1
  AND user_id = $2
RETURNING *;

-- name: DeleteUserPanelLayoutByID :execrows
DELETE FROM user_panel_layouts
WHERE user_id = $1
  AND id = $2;
