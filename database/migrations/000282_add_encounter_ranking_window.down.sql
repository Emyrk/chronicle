BEGIN;

ALTER TABLE log_instance_encounters
  DROP COLUMN ranking_start_offset_ms,
  DROP COLUMN ranking_end_offset_ms;

COMMIT;
