-- name: CreateSharedView :one
INSERT INTO shared_views (
  code,
  instance_id,
  payload,
  created_by
)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetSharedViewByCode :one
SELECT *
FROM shared_views
WHERE code = $1;
