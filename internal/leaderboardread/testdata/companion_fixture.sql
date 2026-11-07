SET LOCAL app.tenant_bypass='true';
INSERT INTO leaderboard_player_boss_benchmarks(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,best_metric,projection_version,algorithm_version)
SELECT '00000000-0000-4000-8000-000000000001','Companions','',0,boss,'MAGE',spec,'','dps',100,7,9 FROM unnest(ARRAY['A','B']) boss CROSS JOIN unnest(ARRAY['Frost','Fire','Ice','Arcane']) spec;
INSERT INTO leaderboard_player_boss_subjects(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version)
SELECT '00000000-0000-4000-8000-000000000001','Companions','',0,boss,'MAGE',spec,'','dps','00000000-0000-4000-8000-000000000002','Mage',5,peak,form,floor,2,3
FROM (VALUES ('A','Frost',100,0,0),('B','Frost',100,0,0),('A','Ice',100,0,0),('B','Ice',100,0,0),('A','Fire',80,80,80),('B','Fire',80,80,80),('A','Arcane',100,100,100)) v(boss,spec,peak,form,floor);
INSERT INTO leaderboard_player_renown_counts(tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,player_guid,kill_count,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Companions','',0,'A','00000000-0000-4000-8000-000000000002','Mage',44,6,8),('00000000-0000-4000-8000-000000000001','Companions','',0,'B','00000000-0000-4000-8000-000000000002','Mage',2,1,1);

INSERT INTO leaderboard_player_boss_subjects(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version)
VALUES ('00000000-0000-4000-8000-000000000001','Companions','',0,'A','MAGE','Frost','','dps','00000000-0000-4000-8000-000000000002','Zero',1,0,0,0,5,8);
