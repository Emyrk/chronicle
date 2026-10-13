BEGIN;

ALTER TABLE site_config
    DROP COLUMN IF EXISTS ads_enabled;

COMMIT;
