DROP INDEX IF EXISTS idx_regression_snapshots_fixture;
DROP TABLE IF EXISTS regression_snapshots;
DROP TABLE IF EXISTS regression_fixtures;
ALTER TABLE log_instances DROP COLUMN IF EXISTS parser_version;
