BEGIN;

ALTER TABLE site_config
    DROP COLUMN IF EXISTS forever_landing_enabled;

COMMIT;
