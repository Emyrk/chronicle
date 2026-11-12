-- READ ONLY. Collect estimates before approving the index builds or backfill.
SET statement_timeout = '10s';
SELECT relname, reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(oid)) AS total_size
FROM pg_class WHERE relname IN ('encounter_dps_rankings', 'parse_score_memberships', 'time_parse_boss_kill_memberships', 'leaderboard_career_renown_facts', 'log_instance_encounters', 'parse_score_results');
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE tablename IN ('encounter_dps_rankings', 'parse_score_memberships', 'time_parse_boss_kill_memberships', 'leaderboard_career_renown_facts', 'log_instance_encounters', 'parse_score_results');


SELECT relname, indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE relname IN ('encounter_dps_rankings', 'parse_score_memberships', 'time_parse_boss_kill_memberships', 'leaderboard_career_renown_facts');
