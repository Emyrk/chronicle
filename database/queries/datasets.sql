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

-- name: ListTenantsByDataset :many
-- Tenants that use this dataset, either directly (tenant.default_dataset_id)
-- or via a server they own (wow_servers.default_dataset_id).
SELECT DISTINCT t.id, t.name, t.slug
FROM tenants t
WHERE t.default_dataset_id = $1
   OR EXISTS (
     SELECT 1 FROM wow_servers s
     WHERE s.tenant_id = t.id AND s.default_dataset_id = $1
   )
ORDER BY t.name;

-- name: ResolveDatasetByRealm :one
-- Resolves the dataset for a realm. Precedence:
--   server.default_dataset_id > tenant.default_dataset_id.
-- The result is NULL when neither is set (and when the realm is unknown the
-- query returns no rows); in both cases the caller falls back to the
-- compiled-in default dataset.
SELECT COALESCE(s.default_dataset_id, t.default_dataset_id) AS dataset_id
FROM wow_server_realms r
JOIN wow_servers s ON s.id = r.server_id
LEFT JOIN tenants t ON t.id = s.tenant_id
WHERE r.id = $1;
