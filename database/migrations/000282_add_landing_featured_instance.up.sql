BEGIN;

ALTER TABLE site_config
    ADD COLUMN landing_featured_instance_id UUID;

COMMIT;
