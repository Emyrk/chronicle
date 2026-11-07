-- Hand-check fixture, executed in an isolated dbtestutil database. No evidence
-- replay is needed to validate the serving contract.
SET LOCAL app.tenant_bypass='true';
INSERT INTO leaderboard_player_boss_benchmarks
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,best_metric,projection_version,algorithm_version)
SELECT '00000000-0000-4000-8000-000000000001','Test raid','',0,boss,'MAGE','Frost','','dps',100,1,1 FROM unnest(ARRAY['Boss A','Boss B']) boss;
INSERT INTO leaderboard_player_boss_subjects
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version)
SELECT '00000000-0000-4000-8000-000000000001','Test raid','',0,boss,'MAGE','Frost','','dps',realm::uuid,subject,10,peak,form,floor,1,1
FROM (VALUES
 ('Boss A','00000000-0000-4000-8000-000000000002','Alice',100,80,50),
 ('Boss A','00000000-0000-4000-8000-000000000002','Bob',80,60,40),
 ('Boss B','00000000-0000-4000-8000-000000000002','Bob',100,80,50),
 ('Boss A','00000000-0000-4000-8000-000000000003','Alice',100,80,50)
) AS v(boss,realm,subject,peak,form,floor);
-- Exact-scope adversaries must not bleed into the selected board.
INSERT INTO leaderboard_player_boss_subjects
SELECT tenant_id,instance_name,'Heroic',25,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version,computed_at,NULL::uuid,NULL::bigint
FROM leaderboard_player_boss_subjects;
INSERT INTO leaderboard_player_boss_subjects
SELECT '00000000-0000-4000-8000-000000000009',instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version,computed_at,NULL::uuid,NULL::bigint
FROM leaderboard_player_boss_subjects WHERE max_players=0;
INSERT INTO leaderboard_player_renown_counts
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,player_guid,kill_count,projection_version,algorithm_version)
VALUES
 ('00000000-0000-4000-8000-000000000001','Test raid','',0,'Boss A','00000000-0000-4000-8000-000000000002','Alice',3,1,1),
 ('00000000-0000-4000-8000-000000000001','Test raid','',0,'Boss B','00000000-0000-4000-8000-000000000002','Alice',7,1,1),
 ('00000000-0000-4000-8000-000000000001','Test raid','Heroic',25,'Boss A','00000000-0000-4000-8000-000000000002','Alice',100,1,1);
INSERT INTO leaderboard_guild_boss_benchmarks
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,best_duration_ms,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Test raid','',0,'Boss A',100,1,1);
INSERT INTO leaderboard_guild_boss_subjects
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,guild_id,observation_count,fastest_duration_ms,form_mean_inverse_ms,floor_mean_inverse_ms,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Test raid','',0,'Boss A','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004',10,200,0.004,0.002,1,1);
INSERT INTO leaderboard_guild_clear_benchmarks
(tenant_id,instance_name,difficulty_name,max_players,best_duration_ms,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Test raid','',0,1000,1,1);
INSERT INTO leaderboard_guild_clear_subjects
(tenant_id,instance_name,difficulty_name,max_players,realm_id,guild_id,observation_count,fastest_duration_ms,form_mean_inverse_ms,floor_mean_inverse_ms,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Test raid','',0,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004',10,2000,0.0004,0.0002,1,1);
INSERT INTO leaderboard_guild_renown_counts
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,guild_id,kill_count,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Test raid','',0,'Boss A','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004',3,1,1);

-- Versions are operational metadata, NOT read eligibility. Deliberately mix
-- benchmark/subject/count versions and include multiple versions in one set.
UPDATE leaderboard_player_boss_benchmarks SET projection_version=7,algorithm_version=9;
UPDATE leaderboard_player_boss_subjects SET projection_version=2,algorithm_version=3 WHERE encounter_name='Boss A';
UPDATE leaderboard_player_boss_subjects SET projection_version=4,algorithm_version=5 WHERE encounter_name='Boss B';
UPDATE leaderboard_player_renown_counts SET projection_version=6,algorithm_version=8 WHERE encounter_name='Boss A';
UPDATE leaderboard_guild_boss_benchmarks SET projection_version=4,algorithm_version=8;
UPDATE leaderboard_guild_boss_subjects SET projection_version=2,algorithm_version=5;
UPDATE leaderboard_guild_clear_benchmarks SET projection_version=7,algorithm_version=9;
UPDATE leaderboard_guild_clear_subjects SET projection_version=3,algorithm_version=4;
UPDATE leaderboard_guild_renown_counts SET projection_version=6,algorithm_version=2;
