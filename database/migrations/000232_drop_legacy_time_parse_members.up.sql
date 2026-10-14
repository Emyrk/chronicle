BEGIN;

-- The compact membership tables are now the only runtime source for time-parse
-- cohorts. These legacy snapshot-owned copies may contain historical data, so
-- apply only after both compact backfills and their verification queries pass.
DROP TABLE IF EXISTS time_parse_boss_kill_members;
DROP TABLE IF EXISTS time_parse_clear_time_members;

COMMIT;
