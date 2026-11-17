BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE log_instance_encounters DROP COLUMN encounter_variant_tooltip;
-- Keep the widened key domain on rollback: narrowing it would either scan
-- populated tables or require deleting valid light-count history. Old binaries
-- can ignore these cohorts while Combined history remains intact.
COMMIT;
