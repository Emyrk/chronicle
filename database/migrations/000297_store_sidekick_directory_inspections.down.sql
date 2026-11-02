BEGIN;

ALTER TABLE sidekick_wow_directories
  DROP CONSTRAINT sidekick_wow_directories_inspection_object,
  DROP COLUMN inspection;

ALTER TABLE sidekick_wow_directories
  RENAME COLUMN log_format TO game_format;

COMMIT;
