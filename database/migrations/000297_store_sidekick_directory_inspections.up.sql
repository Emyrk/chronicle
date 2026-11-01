BEGIN;

ALTER TABLE sidekick_wow_directories
  RENAME COLUMN game_format TO log_format;

ALTER TABLE sidekick_wow_directories
  ADD COLUMN inspection JSONB NOT NULL DEFAULT '{"status":"unknown","checks":[]}'::jsonb,
  ADD CONSTRAINT sidekick_wow_directories_inspection_object
    CHECK (jsonb_typeof(inspection) = 'object');

COMMIT;
