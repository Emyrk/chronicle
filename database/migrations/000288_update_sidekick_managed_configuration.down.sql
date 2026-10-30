BEGIN;

DROP INDEX sidekick_wow_directories_sidekick_id_id_idx;

ALTER TABLE sidekick_wow_directories
  DROP CONSTRAINT sidekick_wow_directories_id_length,
  DROP COLUMN id,
  DROP COLUMN game_format;

ALTER TABLE sidekick_installations
  DROP CONSTRAINT sidekick_installations_auto_upload_capabilities_object,
  DROP COLUMN auto_upload_capabilities,
  DROP COLUMN start_at_login;

COMMIT;
