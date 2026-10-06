-- name: GetUserCustomPanelSettings :one
SELECT *
FROM user_custom_panel_settings
WHERE user_id = @user_id;

-- name: UpsertUserCustomPanelSettings :one
INSERT INTO user_custom_panel_settings (user_id, enabled, installations, revision)
VALUES (@user_id, @enabled, @installations::jsonb, 1)
ON CONFLICT (user_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    installations = EXCLUDED.installations,
    revision = user_custom_panel_settings.revision + 1,
    updated_at = NOW()
WHERE user_custom_panel_settings.revision = @expected_revision
RETURNING *;
