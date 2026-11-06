-- Reverses the schema restoration, deleting any scores computed since 000341.
BEGIN;
DROP TABLE IF EXISTS time_parse_boss_scores;
DROP TABLE IF EXISTS time_parse_scores;
DROP TABLE IF EXISTS time_parse_boss_kill_memberships;
DROP TABLE IF EXISTS time_parse_clear_time_memberships;
DROP TABLE IF EXISTS parse_score_memberships;
DROP TABLE IF EXISTS parse_score_receipts;
DROP TABLE IF EXISTS parse_score_results;
COMMIT;
