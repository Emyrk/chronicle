BEGIN;

ALTER TABLE log_instance_encounters
  DROP COLUMN map_id;

COMMIT;
