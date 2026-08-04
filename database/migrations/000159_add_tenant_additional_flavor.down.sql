BEGIN;

ALTER TABLE tenants DROP COLUMN IF EXISTS additional_flavor;

COMMIT;
