-- name: GetUserCustomPanelSettings :one
SELECT *
FROM user_custom_panel_settings
WHERE user_id = @user_id;

-- name: UpsertUserCustomPanelSettings :one
INSERT INTO user_custom_panel_settings (user_id, enabled, revision)
SELECT @user_id, @enabled, 1
WHERE @expected_revision = 0
   OR EXISTS (SELECT 1 FROM user_custom_panel_settings WHERE user_id = @user_id)
ON CONFLICT (user_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    revision = user_custom_panel_settings.revision + 1,
    updated_at = NOW()
WHERE user_custom_panel_settings.revision = @expected_revision
RETURNING *;

-- name: GetCustomPanelReleaseByRepositoryCommit :one
SELECT *
FROM custom_panel_releases
WHERE repository = @repository
  AND commit_sha = @commit_sha
FOR KEY SHARE;

-- name: InsertCustomPanelRelease :one
INSERT INTO custom_panel_releases (repository, commit_sha, manifest, manifest_sha256)
VALUES (@repository, @commit_sha, @manifest::jsonb, @manifest_sha256)
ON CONFLICT (repository, commit_sha) DO UPDATE
SET repository = EXCLUDED.repository
RETURNING *;

-- name: UpsertUserCustomPanelInstallation :one
INSERT INTO user_custom_panel_installations (user_id, repository, release_id, installed_ref, enabled)
VALUES (@user_id, @repository, @release_id, @installed_ref, @enabled)
ON CONFLICT (user_id, repository) DO UPDATE
SET release_id = EXCLUDED.release_id,
    installed_ref = EXCLUDED.installed_ref,
    enabled = EXCLUDED.enabled,
    updated_at = NOW()
RETURNING *;

-- name: DeleteUserCustomPanelInstallationsExcept :exec
DELETE FROM user_custom_panel_installations
WHERE user_id = @user_id
  AND NOT (repository = ANY(@repositories::text[]));

-- name: ListUserCustomPanelInstallations :many
SELECT
    sqlc.embed(user_custom_panel_installations),
    sqlc.embed(custom_panel_releases)
FROM user_custom_panel_installations
JOIN custom_panel_releases ON custom_panel_releases.id = user_custom_panel_installations.release_id
WHERE user_custom_panel_installations.user_id = @user_id
ORDER BY user_custom_panel_installations.installed_at, user_custom_panel_installations.repository;

-- name: ListAdminActiveCustomPanelInstallations :many
SELECT
    users.id AS user_id,
    users.username,
    user_custom_panel_installations.repository,
    custom_panel_releases.commit_sha,
    user_custom_panel_installations.installed_ref,
    user_custom_panel_installations.installed_at,
    user_custom_panel_installations.updated_at,
    custom_panel_releases.manifest
FROM user_custom_panel_installations
JOIN user_custom_panel_settings ON user_custom_panel_settings.user_id = user_custom_panel_installations.user_id
JOIN custom_panel_releases ON custom_panel_releases.id = user_custom_panel_installations.release_id
JOIN users ON users.id = user_custom_panel_installations.user_id
WHERE user_custom_panel_settings.enabled
  AND user_custom_panel_installations.enabled
ORDER BY user_custom_panel_installations.updated_at DESC, users.username, user_custom_panel_installations.repository;

-- name: DeleteOrphanCustomPanelReleases :execrows
DELETE FROM custom_panel_releases release
WHERE NOT EXISTS (
    SELECT 1
    FROM user_custom_panel_installations installation
    WHERE installation.release_id = release.id
);
