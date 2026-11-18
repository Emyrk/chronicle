BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE log_instance_encounters DROP COLUMN encounter_variant_tooltip_data;
COMMIT;
