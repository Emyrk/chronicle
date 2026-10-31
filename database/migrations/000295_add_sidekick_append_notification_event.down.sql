BEGIN;

DELETE FROM user_notification_settings
WHERE event = 'sidekick_append_accepted';

ALTER TABLE user_notification_settings
  DROP CONSTRAINT user_notification_settings_event_check;

ALTER TABLE user_notification_settings
  ADD CONSTRAINT user_notification_settings_event_check
  CHECK (event IN ('sidekick_upload_accepted', 'upload_processed'));

COMMIT;
