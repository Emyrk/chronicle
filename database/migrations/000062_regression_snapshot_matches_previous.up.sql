ALTER TABLE regression_snapshots
  ADD COLUMN matches_previous BOOLEAN,
  ADD COLUMN previous_snapshot_id UUID REFERENCES regression_snapshots(id) ON DELETE SET NULL;
