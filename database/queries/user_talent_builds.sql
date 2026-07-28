-- name: CreateUserTalentBuild :one
INSERT INTO user_talent_builds (id, user_id, tenant_id, name, class_id, build, locked)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListUserTalentBuilds :many
SELECT *
FROM user_talent_builds
WHERE user_id = $1 AND tenant_id = $2
ORDER BY updated_at DESC;

-- name: GetUserTalentBuildByID :one
SELECT *
FROM user_talent_builds
WHERE id = $1;

-- name: UpdateUserTalentBuildByID :one
UPDATE user_talent_builds
SET
  name = COALESCE(sqlc.narg(name), name),
  build = COALESCE(sqlc.narg(build), build),
  locked = COALESCE(sqlc.narg(locked), locked),
  updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND tenant_id = sqlc.arg(tenant_id)
RETURNING *;

-- name: DeleteUserTalentBuildByID :execrows
DELETE FROM user_talent_builds
WHERE id = $1 AND user_id = $2 AND tenant_id = $3;

-- name: CountUserTalentBuilds :one
SELECT COUNT(*)
FROM user_talent_builds
WHERE user_id = $1 AND tenant_id = $2;
