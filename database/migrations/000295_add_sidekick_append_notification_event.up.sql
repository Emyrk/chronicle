BEGIN;

ALTER TABLE user_notification_settings
  DROP CONSTRAINT user_notification_settings_event_check;

ALTER TABLE user_notification_settings
  ADD CONSTRAINT user_notification_settings_event_check
  CHECK (event IN ('sidekick_upload_accepted', 'sidekick_append_accepted', 'upload_processed'));

COMMIT;
