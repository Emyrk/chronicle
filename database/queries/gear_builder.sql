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

-- ============================================================
-- Stat Weight Pins (admin-managed)
-- ============================================================

-- name: CreateGearStatWeightPin :one
INSERT INTO gear_stat_weight_pins (id, tenant_id, dataset_id, stat_weight_id, pinned_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListGearStatWeightPins :many
SELECT
  p.*,
  sw.name AS stat_weight_name,
  sw.description AS stat_weight_description,
  sw.class_id AS stat_weight_class_id,
  sw.spec_name AS stat_weight_spec_name,
  sw.weights AS stat_weight_weights,
  sw.user_id AS stat_weight_user_id
FROM gear_stat_weight_pins p
JOIN gear_stat_weights sw ON sw.id = p.stat_weight_id
WHERE p.tenant_id = $1 AND p.dataset_id = $2
ORDER BY p.created_at DESC;

-- name: DeleteGearStatWeightPin :execrows
DELETE FROM gear_stat_weight_pins WHERE id = $1 AND tenant_id = $2;
