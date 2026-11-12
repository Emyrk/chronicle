-- MANUAL PRE-DEPLOYMENT PREPARATION ONLY. Do not run inside a transaction.
-- Review pg_class estimates / pg_indexes below before approving production work.
-- Concurrent builds still scan tables, consume IO and disk, and generate WAL.
-- Check index validity afterward; remove INVALID failed indexes before retrying.
SELECT relname, reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(oid)) AS total_size
FROM pg_class WHERE relname IN ('encounter_dps_rankings', 'parse_score_memberships', 'time_parse_boss_kill_memberships', 'leaderboard_career_renown_facts');
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE tablename IN ('encounter_dps_rankings', 'parse_score_memberships', 'time_parse_boss_kill_memberships', 'leaderboard_career_renown_facts');

CREATE UNIQUE INDEX CONCURRENTLY idx_edr_boss_variant_unique ON encounter_dps_rankings (instance_id, player_guid, encounter_name, difficulty_name, max_players) WHERE encounter_id IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY parse_score_memberships_variant_key ON parse_score_memberships (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid, difficulty_name, max_players);
CREATE UNIQUE INDEX CONCURRENTLY time_parse_boss_kill_memberships_variant_key ON time_parse_boss_kill_memberships (tenant_id, policy_version, query_version, run_id, encounter_name, difficulty_name, max_players);
CREATE UNIQUE INDEX CONCURRENTLY leaderboard_career_renown_facts_variant_key ON leaderboard_career_renown_facts (tenant_id, run_id, encounter_name, realm_id, player_guid, player_class, player_spec, player_sub_spec, difficulty_name, max_players);
