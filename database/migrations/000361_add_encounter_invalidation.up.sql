BEGIN;

ALTER TABLE log_instance_encounters
  ADD COLUMN invalidated_at TIMESTAMPTZ,
  ADD COLUMN invalid_reason TEXT NOT NULL DEFAULT '';

COMMIT;
