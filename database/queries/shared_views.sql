-- name: CreateSharedView :one
INSERT INTO shared_views (
  code,
  hash,
  instance_id,
  instance_slug,
  payload,
  created_by
)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetSharedViewByCode :one
SELECT shared_views.*
FROM shared_views
WHERE code = $1
  AND EXISTS (
    SELECT 1
    FROM log_instances instance
    JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id
    WHERE NOT log_group.unlisted
      AND (
        (shared_views.instance_id IS NOT NULL AND instance.id = shared_views.instance_id)
        OR (shared_views.instance_id IS NULL AND shared_views.instance_slug <> '' AND instance.hashed_slug = shared_views.instance_slug)
      )
  );

-- name: GetSharedViewByInstanceAndHash :one
SELECT *
FROM shared_views
WHERE instance_id = $1 AND hash = $2;
