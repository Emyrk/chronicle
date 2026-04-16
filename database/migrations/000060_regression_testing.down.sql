DROP INDEX IF EXISTS idx_regression_snapshots_fixture;
-- build_time column is part of regression_snapshots table, dropped with it
DROP TABLE IF EXISTS regression_snapshots;
DROP TABLE IF EXISTS regression_fixtures;
ALTER TABLE log_instances DROP COLUMN IF EXISTS parser_version;
