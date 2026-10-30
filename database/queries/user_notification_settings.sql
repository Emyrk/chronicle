-- name: ListUserNotificationSettings :many
SELECT *
FROM user_notification_settings
WHERE user_id = @user_id
ORDER BY channel, event;

-- name: UpsertUserNotificationSetting :one
INSERT INTO user_notification_settings (user_id, channel, event, enabled)
VALUES (@user_id, @channel, @event, @enabled)
ON CONFLICT (user_id, channel, event) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = NOW()
RETURNING *;

-- GetDiscordNotificationTarget returns the user's linked Discord ID when they
-- have opted into Discord DMs for the event.
-- name: GetDiscordNotificationTarget :one
SELECT ual.linked_id
FROM user_notification_settings uns
JOIN user_auth_links ual ON ual.user_id = uns.user_id AND ual.provider = 'discord'
WHERE uns.user_id = @user_id
  AND uns.channel = 'discord'
  AND uns.event = @event
  AND uns.enabled
LIMIT 1;
