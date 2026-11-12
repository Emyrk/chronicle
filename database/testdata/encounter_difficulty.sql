-- Isolated regression fixture. The transaction-local setting bypasses unrelated
-- realm/log-upload FKs; all difficulty relationships remain real table rows.
SET LOCAL session_replication_role = replica;
INSERT INTO wow_server_realms (id, server_id, name)
VALUES ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Difficulty test');
INSERT INTO log_instances (id, realm_id, log_group_id, name, difficulty_name, max_players, dynamic_difficulty)
VALUES
 ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), 'Test raid', '25 Player (Heroic)', 25, 0),
 ('00000000-0000-0000-0000-000000000002', gen_random_uuid(), gen_random_uuid(), 'Test raid', '25 Player', 25, 1),
 ('00000000-0000-0000-0000-000000000003', gen_random_uuid(), gen_random_uuid(), 'Test raid', '10 Player', 10, 0);
INSERT INTO log_instance_encounters (id, instance_id, name, remaining, boss, start_time, end_time, kill_type, difficulty)
VALUES
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Boss', '{}', true, '2026-01-01', '2026-01-01 00:01', 'clean', NULL),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Boss', '{}', true, '2026-01-01', '2026-01-01 00:01', 'wipe', ''),
 ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Trash', '{}', false, '2026-01-01', '2026-01-01 00:01', 'clean', 'mythic'),
 ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Boss', '{}', true, '2026-01-01', '2026-01-01 00:01', 'clean', NULL),
 ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'Boss', '{}', true, '2026-01-01', '2026-01-01 00:01', 'clean', NULL),
 ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'Boss', '{}', true, '2026-01-01', '2026-01-01 00:01', 'wipe', 'mythic');
-- Explicit normalized keys bypass old dynamic/label normalization. The fourth
-- instance intentionally has no encounter evidence: scalar reads do not scan it.
INSERT INTO log_instances (id, realm_id, log_group_id, name, difficulty_name, max_players, dynamic_difficulty, difficulty_normalized)
VALUES ('00000000-0000-0000-0000-000000000004', gen_random_uuid(), gen_random_uuid(), 'Test raid', 'mythic', 25, 1, true);
INSERT INTO encounter_dps_rankings (encounter_id, instance_id, encounter_name, instance_name, player_guid, player_name,
 difficulty_name, max_players, realm_id, realm_name, damage_done, duration_secs, dps, killed_at)
VALUES
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Boss', 'Test raid', 'player-one', 'One', 'wrong old label', 10, gen_random_uuid(), 'Test', 100, 60, 1, '2026-01-01'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Boss', 'Test raid', 'player-two', 'Two', 'wrong old label', 10, gen_random_uuid(), 'Test', 100, 60, 1, '2026-01-01'),
 (NULL, '00000000-0000-0000-0000-000000000004', 'Trash', 'Test raid', 'player-three', 'Three', 'wrong old label', 10, gen_random_uuid(), 'Test', 100, 60, 1, '2026-01-01');
-- The same logical boss/player must coexist in Normal and heroic memberships.
INSERT INTO parse_score_memberships (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid,
 instance_id, log_group_id, difficulty_name, max_players, player_class, player_spec, killed_at, dps)
SELECT '00000000-0000-0000-0000-000000000001', 1, 1, '00000000-0000-0000-0000-000000000001', 'Boss', 'player-one',
 '00000000-0000-0000-0000-000000000001', gen_random_uuid(), difficulty, 25, 'Mage', 'Fire', '2026-01-01', 100
FROM unnest(ARRAY['', 'heroic']) AS difficulty;
INSERT INTO time_parse_boss_kill_memberships (tenant_id, policy_version, query_version, run_id, encounter_name,
 instance_id, log_group_id, instance_name, difficulty_name, max_players, duration_ms, killed_at)
SELECT '00000000-0000-0000-0000-000000000001', 1, 1, '00000000-0000-0000-0000-000000000001', 'Boss',
 '00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Test raid', difficulty, 25, 60000, '2026-01-01'
FROM unnest(ARRAY['', 'heroic']) AS difficulty;
INSERT INTO leaderboard_career_renown_facts (tenant_id, run_id, source_instance_id, realm_id, player_guid,
 player_class, player_spec, player_sub_spec, instance_name, difficulty_name, max_players, encounter_name, source_encounter_id)
SELECT '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'player-one',
 'Mage', 'Fire', '', 'Test raid', difficulty, 25, 'Boss', '10000000-0000-0000-0000-000000000001'
FROM unnest(ARRAY['', 'heroic']) AS difficulty;
SET LOCAL session_replication_role = origin;
