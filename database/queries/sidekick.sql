-- name: UpsertSidekickInstallation :one
INSERT INTO sidekick_installations (id, user_id, name, platform, version)
VALUES (@id, @user_id, @name, @platform, @version)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  platform = EXCLUDED.platform,
  version = EXCLUDED.version,
  disconnected_at = NULL,
  updated_at = NOW()
WHERE sidekick_installations.user_id = EXCLUDED.user_id
RETURNING *;

-- name: SetSidekickInstallationCampaign :exec
-- The first campaign wins: a row that already holds any utm_* is left as is.
UPDATE sidekick_installations
SET utm_source = @utm_source,
    utm_medium = @utm_medium,
    utm_campaign = @utm_campaign,
    utm_content = @utm_content
WHERE id = @id
  AND user_id = @user_id
  AND utm_source IS NULL
  AND utm_medium IS NULL
  AND utm_campaign IS NULL
  AND utm_content IS NULL;

-- name: RevokeActiveSidekickOAuthGrants :many
UPDATE sidekick_oauth_grants
SET revoked_at = NOW()
WHERE sidekick_id = @sidekick_id
  AND revoked_at IS NULL
RETURNING oauth_request_id;

-- name: InsertSidekickOAuthGrant :exec
INSERT INTO sidekick_oauth_grants (oauth_request_id, sidekick_id)
VALUES (@oauth_request_id, @sidekick_id)
ON CONFLICT (oauth_request_id) DO UPDATE SET
  sidekick_id = EXCLUDED.sidekick_id,
  revoked_at = NULL;

-- name: GetSidekickInstallationForOAuthRequest :one
SELECT si.id
FROM sidekick_oauth_grants sog
JOIN sidekick_installations si ON si.id = sog.sidekick_id
WHERE sog.oauth_request_id = @oauth_request_id
  AND si.user_id = @user_id
  AND sog.revoked_at IS NULL
  AND si.disconnected_at IS NULL;

-- name: ListSidekickInstallationsByUser :many
SELECT *
FROM sidekick_installations
WHERE user_id = @user_id
ORDER BY disconnected_at NULLS FIRST, created_at DESC;

-- name: GetSidekickInstallationByUser :one
SELECT *
FROM sidekick_installations
WHERE id = @sidekick_id
  AND user_id = @user_id;

-- name: GetSidekickAccountConfig :one
SELECT config
FROM sidekick_account_configs
WHERE user_id = @user_id;

-- name: UpsertSidekickAccountConfig :one
INSERT INTO sidekick_account_configs (user_id, config)
VALUES (@user_id, @config::jsonb)
ON CONFLICT (user_id) DO UPDATE SET
  config = EXCLUDED.config,
  updated_at = NOW()
RETURNING config;

-- name: GetSidekickConfigOverride :one
SELECT sco.config
FROM sidekick_config_overrides sco
JOIN sidekick_installations si ON si.id = sco.sidekick_id
WHERE sco.sidekick_id = @sidekick_id
  AND si.user_id = @user_id;

-- name: UpsertSidekickConfigOverride :one
INSERT INTO sidekick_config_overrides (sidekick_id, config)
SELECT id, @config::jsonb
FROM sidekick_installations
WHERE id = @sidekick_id
  AND user_id = @user_id
  AND disconnected_at IS NULL
ON CONFLICT (sidekick_id) DO UPDATE SET
  config = EXCLUDED.config,
  updated_at = NOW()
RETURNING config;

-- name: DeleteSidekickConfigOverride :one
DELETE FROM sidekick_config_overrides sco
USING sidekick_installations si
WHERE sco.sidekick_id = @sidekick_id
  AND si.id = sco.sidekick_id
  AND si.user_id = @user_id
  AND si.disconnected_at IS NULL
RETURNING sco.config;

-- name: RenameSidekickInstallation :one
UPDATE sidekick_installations
SET name = @name,
    updated_at = NOW()
WHERE id = @id
  AND user_id = @user_id
  AND disconnected_at IS NULL
RETURNING *;

-- name: UpdateSidekickHeartbeat :one
UPDATE sidekick_installations
SET platform = @platform,
    version = @version,
    last_seen_at = NOW(),
    updated_at = NOW()
WHERE id = @id
  AND user_id = @user_id
  AND disconnected_at IS NULL
RETURNING *;

-- name: TouchSidekickUpload :execrows
UPDATE sidekick_installations
SET last_seen_at = NOW(),
    last_upload_at = NOW(),
    updated_at = NOW()
WHERE id = @id
  AND user_id = @user_id
  AND disconnected_at IS NULL;

-- name: CountSidekickLogGroupsByUser :one
-- Log groups uploaded by any of the user's Sidekick installations; 1 right
-- after an upload means it was the account's first (the first_upload event).
SELECT COUNT(*)
FROM wow_log_groups g
JOIN sidekick_installations si ON si.id = g.sidekick_installation_id
WHERE si.user_id = @user_id;

-- name: DisconnectSidekickInstallation :one
UPDATE sidekick_installations
SET disconnected_at = NOW(),
    updated_at = NOW()
WHERE id = @id
  AND user_id = @user_id
  AND disconnected_at IS NULL
RETURNING *;

-- name: UpsertSidekickWoWDirectory :exec
INSERT INTO sidekick_wow_directories (
  sidekick_id, path, tenant_name, tenant_base_url, realmlist
)
VALUES (
  @sidekick_id, @path, @tenant_name, @tenant_base_url, @realmlist
)
ON CONFLICT (sidekick_id, path) DO UPDATE SET
  tenant_name = EXCLUDED.tenant_name,
  tenant_base_url = EXCLUDED.tenant_base_url,
  realmlist = EXCLUDED.realmlist,
  updated_at = NOW();

-- name: DeleteSidekickWoWDirectoriesExcept :execrows
DELETE FROM sidekick_wow_directories
WHERE sidekick_id = @sidekick_id
  AND NOT (path = ANY(@active_paths::text[]));

-- name: ListSidekickWoWDirectories :many
SELECT *
FROM sidekick_wow_directories
WHERE sidekick_id = @sidekick_id
ORDER BY tenant_name, path;

-- name: UpsertActiveSidekickIssue :one
INSERT INTO sidekick_issues (sidekick_id, code, message, details)
VALUES (@sidekick_id, @code, @message, @details)
ON CONFLICT (sidekick_id, code) WHERE resolved_at IS NULL
DO UPDATE SET
  message = EXCLUDED.message,
  details = EXCLUDED.details,
  last_reported_at = NOW()
RETURNING *;

-- name: ResolveSidekickIssuesExcept :execrows
UPDATE sidekick_issues
SET resolved_at = NOW()
WHERE sidekick_id = @sidekick_id
  AND resolved_at IS NULL
  AND NOT (code = ANY(@active_codes::text[]));

-- name: ListSidekickIssues :many
SELECT *
FROM sidekick_issues
WHERE sidekick_id = @sidekick_id
ORDER BY resolved_at NULLS FIRST, last_reported_at DESC
LIMIT @limit_count;
