-- ============================================================
-- Gear Progressions
-- ============================================================

-- name: CreateGearProgression :one
INSERT INTO gear_progressions (id, user_id, tenant_id, title, description, class_id, spec_name, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetGearProgressionByID :one
SELECT * FROM gear_progressions WHERE id = $1;

-- name: ListGearProgressionsByUser :many
SELECT * FROM gear_progressions
WHERE user_id = $1 AND tenant_id = $2
ORDER BY updated_at DESC;

-- name: UpdateGearProgression :one
UPDATE gear_progressions SET
  title = COALESCE(sqlc.narg(title), title),
  description = COALESCE(sqlc.narg(description), description),
  class_id = COALESCE(sqlc.narg(class_id), class_id),
  spec_name = COALESCE(sqlc.narg(spec_name), spec_name),
  payload = COALESCE(sqlc.narg(payload), payload),
  updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND tenant_id = sqlc.arg(tenant_id)
RETURNING *;

-- name: DeleteGearProgression :execrows
DELETE FROM gear_progressions WHERE id = $1 AND user_id = $2 AND tenant_id = $3;

-- name: CountUserGearProgressions :one
SELECT COUNT(*) FROM gear_progressions WHERE user_id = $1 AND tenant_id = $2;
