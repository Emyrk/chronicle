BEGIN;

ALTER TABLE log_group_artifacts
  ADD COLUMN log_file_part_id UUID REFERENCES log_file_parts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX log_group_artifacts_log_file_part_id_idx
  ON log_group_artifacts(log_file_part_id)
  WHERE log_file_part_id IS NOT NULL;

COMMIT;
