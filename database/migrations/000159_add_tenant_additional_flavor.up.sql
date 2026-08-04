BEGIN;

ALTER TABLE tenants
    ADD COLUMN additional_flavor text[] NOT NULL DEFAULT '{}';

COMMIT;
