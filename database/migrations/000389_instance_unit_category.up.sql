BEGIN;

ALTER TABLE log_instance_units ADD COLUMN category text NOT NULL DEFAULT 'unknown';

COMMIT;
