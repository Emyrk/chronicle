ALTER TABLE regression_snapshots
  DROP COLUMN IF EXISTS previous_snapshot_id,
  DROP COLUMN IF EXISTS matches_previous;
