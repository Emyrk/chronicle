BEGIN;

ALTER TABLE log_instance_units DROP COLUMN category;

COMMIT;
