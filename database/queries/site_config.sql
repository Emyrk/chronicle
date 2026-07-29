-- name: GetSiteConfig :one
SELECT * FROM site_config WHERE id = TRUE;

-- name: UpdateSiteConfig :one
UPDATE site_config SET
    signups_enabled = COALESCE(sqlc.narg('signups_enabled'), signups_enabled),
    branding = COALESCE(sqlc.narg('branding'), branding),
    discoverable = COALESCE(sqlc.narg('discoverable'), discoverable),
    default_format = COALESCE(sqlc.narg('default_format'), default_format),
    available_formats = COALESCE(sqlc.narg('available_formats'), available_formats),
    client_uploads_disabled = COALESCE(sqlc.narg('client_uploads_disabled'), client_uploads_disabled),
    external_verification = COALESCE(sqlc.narg('external_verification'), external_verification),
    updated_at = now()
WHERE id = TRUE
RETURNING *;
