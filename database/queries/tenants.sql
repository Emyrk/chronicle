-- Tenant queries. These run with AdminBypass context since the tenants table
-- itself is not behind RLS (only wow_servers/wow_server_realms are).

-- name: GetTenantBySlug :one
SELECT * FROM tenants WHERE slug = $1;

-- name: GetTenantByID :one
SELECT * FROM tenants WHERE id = $1;

-- name: ListTenants :many
SELECT * FROM tenants ORDER BY name;

-- name: InsertTenant :one
INSERT INTO tenants (id, slug, name, disable_client_upload, include_in_all, branding, discoverable)
VALUES (@id, @slug, @name, @disable_client_upload, @include_in_all, @branding, @discoverable)
RETURNING *;

-- name: UpdateTenant :one
-- Only non-null params are applied; NULL means "keep existing value".
UPDATE tenants SET
    slug = COALESCE(sqlc.narg('slug'), slug),
    name = COALESCE(sqlc.narg('name'), name),
    disable_client_upload = COALESCE(sqlc.narg('disable_client_upload'), disable_client_upload),
    include_in_all = COALESCE(sqlc.narg('include_in_all'), include_in_all),
    branding = COALESCE(sqlc.narg('branding'), branding),
    discoverable = COALESCE(sqlc.narg('discoverable'), discoverable),
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteTenant :exec
DELETE FROM tenants WHERE id = $1;

-- name: SetServerTenant :exec
-- Assigns or removes a tenant from a server.
-- Pass NULL to remove the tenant assignment.
UPDATE wow_servers SET tenant_id = $2 WHERE id = $1;

-- name: SetTenantDataset :exec
-- Assigns or removes a default dataset from a tenant.
-- Pass NULL to remove the assignment.
UPDATE tenants SET default_dataset_id = $2, updated_at = now() WHERE id = $1;

