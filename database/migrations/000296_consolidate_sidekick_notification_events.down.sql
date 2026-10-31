BEGIN;

ALTER TABLE user_notification_settings
  DROP CONSTRAINT user_notification_settings_event_check;

INSERT INTO user_notification_settings (user_id, channel, event, enabled, updated_at)
SELECT settings.user_id, settings.channel, events.event, settings.enabled, settings.updated_at
FROM user_notification_settings AS settings
CROSS JOIN (VALUES ('sidekick_upload_accepted'), ('sidekick_append_accepted')) AS events(event)
WHERE settings.event = 'sidekick_notifications';

DELETE FROM user_notification_settings
WHERE event = 'sidekick_notifications';

ALTER TABLE user_notification_settings
  ADD CONSTRAINT user_notification_settings_event_check
  CHECK (event IN ('sidekick_upload_accepted', 'sidekick_append_accepted', 'upload_processed'));

COMMIT;
