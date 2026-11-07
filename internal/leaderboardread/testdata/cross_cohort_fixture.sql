-- Different raw scales, same normalized score contract. The same player has
-- two Mage specs and must remain two distinct cohort-qualified rows.
SET LOCAL app.tenant_bypass='true';
INSERT INTO leaderboard_player_boss_benchmarks
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,best_metric,projection_version,algorithm_version)
SELECT '00000000-0000-4000-8000-000000000001','Cross raid','',0,boss,cls,spec,'','dps',benchmark,1,1
FROM (VALUES ('MAGE','Frost',1000::float8),('MAGE','Arcane',2000::float8),('HUNTER','Survival',10000::float8)) c(cls,spec,benchmark),unnest(ARRAY['A','B']) boss;
INSERT INTO leaderboard_player_boss_subjects
(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version)
SELECT '00000000-0000-4000-8000-000000000001','Cross raid','',0,boss,cls,spec,'','dps','00000000-0000-4000-8000-000000000002',player,10,raw,raw,raw,3,7
FROM (VALUES ('A','MAGE','Frost','mage',980::float8),('A','MAGE','Arcane','mage',1960::float8),('A','HUNTER','Survival','hunter',9900::float8),('B','HUNTER','Survival','hunter',9900::float8)) v(boss,cls,spec,player,raw);
