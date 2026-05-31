-- Dataset queries. These run with AdminBypass context since the datasets table
-- itself is not behind RLS.

-- name: GetDataset :one
SELECT * FROM datasets WHERE id = $1;

-- name: GetDatasetBySlug :one
SELECT * FROM datasets WHERE slug = $1;

-- name: ListDatasets :many
SELECT * FROM datasets ORDER BY name;

-- name: InsertDataset :one
INSERT INTO datasets (name, slug, wow_version, build_version, description)
VALUES (@name, @slug, @wow_version, @build_version, @description)
RETURNING *;

-- name: UpdateDataset :one
-- Only non-null params are applied; NULL means "keep existing value".
UPDATE datasets SET
    name              = COALESCE(sqlc.narg('name'), name),
    slug              = COALESCE(sqlc.narg('slug'), slug),
    wow_version       = COALESCE(sqlc.narg('wow_version'), wow_version),
    build_version     = COALESCE(sqlc.narg('build_version'), build_version),
    description       = COALESCE(sqlc.narg('description'), description),
    updated_at        = now()
WHERE id = @id
RETURNING *;

-- name: DeleteDataset :exec
DELETE FROM datasets WHERE id = $1;
