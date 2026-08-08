-- ============================================================
-- Gear Lists
-- ============================================================

-- name: CreateGearList :one
INSERT INTO gear_lists (id, user_id, tenant_id, title, description, class_id, spec_name, payload,
                        forked_from_list_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, sqlc.narg(forked_from_list_id))
RETURNING *;

-- name: GetGearListByID :one
SELECT * FROM gear_lists WHERE id = $1;

-- name: ListGearListsByUser :many
SELECT * FROM gear_lists
WHERE user_id = $1 AND tenant_id = $2
ORDER BY updated_at DESC;

-- name: UpdateGearList :one
UPDATE gear_lists SET
  title = COALESCE(sqlc.narg(title), title),
  description = COALESCE(sqlc.narg(description), description),
  class_id = COALESCE(sqlc.narg(class_id), class_id),
  spec_name = COALESCE(sqlc.narg(spec_name), spec_name),
  payload = COALESCE(sqlc.narg(payload), payload),
  updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND tenant_id = sqlc.arg(tenant_id)
RETURNING *;

-- name: DeleteGearList :execrows
DELETE FROM gear_lists WHERE id = $1 AND user_id = $2 AND tenant_id = $3;

-- name: CountUserGearLists :one
SELECT COUNT(*) FROM gear_lists WHERE user_id = $1 AND tenant_id = $2;

-- ============================================================
-- Stat Weights
-- ============================================================

-- name: CreateGearStatWeight :one
INSERT INTO gear_stat_weights (id, user_id, tenant_id, name, description, class_id, spec_name, weights)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetGearStatWeightByID :one
SELECT * FROM gear_stat_weights WHERE id = $1;

-- name: ListGearStatWeightsByUser :many
SELECT * FROM gear_stat_weights
WHERE user_id = $1 AND tenant_id = $2
ORDER BY updated_at DESC;

-- name: UpdateGearStatWeight :one
UPDATE gear_stat_weights SET
  name = COALESCE(sqlc.narg(name), name),
  description = COALESCE(sqlc.narg(description), description),
  class_id = COALESCE(sqlc.narg(class_id), class_id),
  spec_name = COALESCE(sqlc.narg(spec_name), spec_name),
  weights = COALESCE(sqlc.narg(weights), weights),
  updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND tenant_id = sqlc.arg(tenant_id)
RETURNING *;

-- name: DeleteGearStatWeight :execrows
DELETE FROM gear_stat_weights WHERE id = $1 AND user_id = $2 AND tenant_id = $3;
