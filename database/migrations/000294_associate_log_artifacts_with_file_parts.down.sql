BEGIN;

DROP INDEX IF EXISTS log_group_artifacts_log_file_part_id_idx;

ALTER TABLE log_group_artifacts
  DROP COLUMN IF EXISTS log_file_part_id;

COMMIT;
