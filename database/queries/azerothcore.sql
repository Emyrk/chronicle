-- Servers

-- name: ListWoWServers :many
SELECT * FROM wow_servers ORDER BY name;
-- name: ListWoWServersByTenantID :many
SELECT * FROM wow_servers WHERE tenant_id = $1 ORDER BY name;


-- name: GetWoWServer :one
SELECT * FROM wow_servers WHERE id = $1;
-- name: GetWoWServerByName :one
SELECT * FROM wow_servers WHERE name = $1;


-- name: InsertWoWServer :one
INSERT INTO wow_servers (id, name, description, url, created_by, pricing_provider)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
-- name: UpdateWoWServer :one
UPDATE wow_servers SET
    name = @name,
    description = @description,
    url = @url,
    pricing_provider = @pricing_provider
WHERE id = @id
RETURNING *;


-- name: DeleteWoWServer :exec
DELETE FROM wow_servers WHERE id = $1;

-- Realms

-- name: ListWoWServerRealms :many
SELECT * FROM wow_server_realms WHERE server_id = $1 ORDER BY name;

-- name: ListAllWoWServerRealms :many
SELECT * FROM wow_server_realms ORDER BY name;


-- name: GetWoWServerRealm :one
SELECT * FROM wow_server_realms WHERE id = $1;

-- name: GetWoWServerRealmByName :one
SELECT * FROM wow_server_realms WHERE lower(name) = lower(@name) LIMIT 1;


-- name: InsertWoWServerRealm :one
INSERT INTO wow_server_realms (
    id, server_id, name, description, url, created_by,
    pricing_route_name, pricing_auction_house
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
-- name: UpdateWoWServerRealm :one
UPDATE wow_server_realms SET
    name = @name,
    description = @description,
    url = @url,
    pricing_route_name = @pricing_route_name,
    pricing_auction_house = @pricing_auction_house
WHERE id = @id
RETURNING *;


-- name: DeleteWoWServerRealm :exec
DELETE FROM wow_server_realms WHERE id = $1;

-- Upload Keys

-- name: InsertUploadKey :one
INSERT INTO wow_server_upload_keys (id, realm_id, secret_hash, description, created_by)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: ListUploadKeysByRealm :many
SELECT id, realm_id, description, created_at, last_used_at, created_by
FROM wow_server_upload_keys WHERE realm_id = $1 ORDER BY created_at;

-- name: GetUploadKey :one
SELECT * FROM wow_server_upload_keys WHERE id = $1;

-- name: DeleteUploadKey :exec
DELETE FROM wow_server_upload_keys WHERE id = $1;

-- name: GetUploadKeyByHash :one
SELECT uk.*, wsr.server_id
FROM wow_server_upload_keys uk
JOIN wow_server_realms wsr ON wsr.id = uk.realm_id
WHERE uk.secret_hash = $1;

-- name: TouchUploadKeyLastUsed :exec
UPDATE wow_server_upload_keys SET last_used_at = now() WHERE id = $1;

-- name: SetServerDataset :exec
-- Assigns or removes a default dataset from a server.
-- Pass NULL to remove the assignment.
UPDATE wow_servers SET default_dataset_id = $2 WHERE id = $1;
