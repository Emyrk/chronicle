BEGIN;

DROP INDEX IF EXISTS idx_wow_log_groups_sidekick_installation_id;

ALTER TABLE wow_log_groups
    DROP COLUMN IF EXISTS sidekick_installation_id,
    DROP COLUMN IF EXISTS upload_source;

DROP TYPE IF EXISTS upload_source;

COMMIT;
