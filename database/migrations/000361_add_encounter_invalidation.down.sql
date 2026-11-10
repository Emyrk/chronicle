BEGIN;

ALTER TABLE log_instance_encounters
  DROP COLUMN invalid_reason,
  DROP COLUMN invalidated_at;

COMMIT;
