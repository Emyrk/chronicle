-- name: GetDataset :one
SELECT * FROM datasets WHERE id = $1;

-- name: GetDatasetBySlug :one
SELECT * FROM datasets WHERE slug = $1;

-- name: ListDatasets :many
SELECT * FROM datasets ORDER BY name;

-- name: InsertDataset :one
INSERT INTO datasets (id, name, slug, wow_version, build_version, description)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateDataset :one
UPDATE datasets SET
    name = COALESCE(sqlc.narg('name'), name),
    slug = COALESCE(sqlc.narg('slug'), slug),
    wow_version = COALESCE(sqlc.narg('wow_version'), wow_version),
    build_version = COALESCE(sqlc.narg('build_version'), build_version),
    description = COALESCE(sqlc.narg('description'), description),
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteDataset :exec
DELETE FROM datasets WHERE id = $1;
