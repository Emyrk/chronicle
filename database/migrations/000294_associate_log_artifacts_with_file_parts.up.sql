-- Originally merged as 000289, which collided with 000289_reserved. Renumbered
-- so databases already past 289 still apply it; IF NOT EXISTS keeps it safe for
-- dev databases that ran it under the old number.
BEGIN;

ALTER TABLE log_group_artifacts
  ADD COLUMN IF NOT EXISTS log_file_part_id UUID REFERENCES log_file_parts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS log_group_artifacts_log_file_part_id_idx
  ON log_group_artifacts(log_file_part_id)
  WHERE log_file_part_id IS NOT NULL;

COMMIT;
