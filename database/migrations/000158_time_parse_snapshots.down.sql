DROP TABLE IF EXISTS time_parse_boss_kill_members;
DROP TABLE IF EXISTS time_parse_clear_time_members;
DROP TABLE IF EXISTS time_parse_snapshots;
-- Drop the polyfill aggregate only when it was created by this migration
-- (PG < 14). On PG 14+ the built-in is protected and DROP will no-op.
DROP AGGREGATE IF EXISTS bit_xor(bigint);
