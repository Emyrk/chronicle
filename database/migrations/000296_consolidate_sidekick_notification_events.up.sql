BEGIN;

ALTER TABLE user_notification_settings
  DROP CONSTRAINT user_notification_settings_event_check;

INSERT INTO user_notification_settings (user_id, channel, event, enabled, updated_at)
SELECT user_id, channel, 'sidekick_notifications', BOOL_OR(enabled), MAX(updated_at)
FROM user_notification_settings
WHERE event IN ('sidekick_upload_accepted', 'sidekick_append_accepted')
GROUP BY user_id, channel;

DELETE FROM user_notification_settings
WHERE event IN ('sidekick_upload_accepted', 'sidekick_append_accepted');

ALTER TABLE user_notification_settings
  ADD CONSTRAINT user_notification_settings_event_check
  CHECK (event IN ('sidekick_notifications', 'upload_processed'));

COMMIT;
