BEGIN;

ALTER TABLE log_instance_encounters
  ADD COLUMN ranking_start_offset_ms BIGINT,
  ADD COLUMN ranking_end_offset_ms BIGINT;

COMMIT;
