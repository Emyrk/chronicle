-- name: ListUserPanelLayouts :many
SELECT *
FROM user_panel_layouts
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: CreateUserPanelLayout :one
INSERT INTO user_panel_layouts (
  id,
  user_id,
  title,
  icon,
  description,
  payload
)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateUserPanelLayoutByID :one
UPDATE user_panel_layouts
SET
  title = COALESCE(sqlc.narg(title), title),
  icon = COALESCE(sqlc.narg(icon), icon),
  description = COALESCE(sqlc.narg(description), description),
  payload = COALESCE(sqlc.narg(payload), payload),
  updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: DeleteUserPanelLayoutByID :execrows
DELETE FROM user_panel_layouts
WHERE id = $1;
