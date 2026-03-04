-- name: ListUserPanelLayouts :many
SELECT
  upl.id,
  upl.user_id,
  upl.title,
  upl.title_normalized,
  upl.icon,
  upl.description,
  upl.payload,
  upl.version,
  upl.created_at,
  upl.updated_at,
  owner.username AS owner_username,
  false::boolean AS is_tracked,
  COALESCE(tc.cnt, 0)::bigint AS tracker_count
FROM user_panel_layouts upl
LEFT JOIN users owner ON owner.id = upl.user_id
LEFT JOIN (
  SELECT layout_id, COUNT(*) AS cnt
  FROM user_tracked_layouts
  GROUP BY layout_id
) tc ON tc.layout_id = upl.id
WHERE upl.user_id = $1

UNION ALL

SELECT
  upl.id,
  upl.user_id,
  upl.title,
  upl.title_normalized,
  upl.icon,
  upl.description,
  upl.payload,
  upl.version,
  upl.created_at,
  upl.updated_at,
  owner.username AS owner_username,
  true::boolean AS is_tracked,
  COALESCE(tc.cnt, 0)::bigint AS tracker_count
FROM user_tracked_layouts utl
JOIN user_panel_layouts upl ON upl.id = utl.layout_id
LEFT JOIN users owner ON owner.id = upl.user_id
LEFT JOIN (
  SELECT layout_id, COUNT(*) AS cnt
  FROM user_tracked_layouts
  GROUP BY layout_id
) tc ON tc.layout_id = upl.id
WHERE utl.user_id = $1
ORDER BY is_tracked, created_at DESC;

-- name: GetPanelLayoutByID :one
SELECT
  upl.id,
  upl.user_id,
  upl.title,
  upl.title_normalized,
  upl.icon,
  upl.description,
  upl.payload,
  upl.version,
  upl.created_at,
  upl.updated_at,
  owner.username AS owner_username,
  COALESCE(tc.cnt, 0)::bigint AS tracker_count
FROM user_panel_layouts upl
LEFT JOIN users owner ON owner.id = upl.user_id
LEFT JOIN (
  SELECT layout_id, COUNT(*) AS cnt
  FROM user_tracked_layouts
  GROUP BY layout_id
) tc ON tc.layout_id = upl.id
WHERE upl.id = $1;

-- name: CountUserPanelLayoutsTotal :one
SELECT
  (SELECT COUNT(*) FROM user_panel_layouts upl WHERE upl.user_id = $1) +
  (SELECT COUNT(*) FROM user_tracked_layouts utl WHERE utl.user_id = $1)
AS total;

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
  version = version + 1,
  updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: TrackUserPanelLayout :one
INSERT INTO user_tracked_layouts (user_id, layout_id)
VALUES ($1, $2)
ON CONFLICT (user_id, layout_id) DO UPDATE SET layout_id = EXCLUDED.layout_id
RETURNING *;

-- name: UntrackUserPanelLayout :execrows
DELETE FROM user_tracked_layouts
WHERE user_id = $1 AND layout_id = $2;

-- name: IsLayoutTrackedByUser :one
SELECT EXISTS (
  SELECT 1 FROM user_tracked_layouts WHERE user_id = $1 AND layout_id = $2
);

-- name: DeleteUserPanelLayoutByID :execrows
UPDATE user_panel_layouts
SET user_id = NULL
WHERE id = $1 AND user_id IS NOT NULL;
