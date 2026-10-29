BEGIN;

ALTER TABLE site_config
    DROP COLUMN IF EXISTS landing_featured_instance_id;

COMMIT;
