-- Exact raw-peak observation provenance: other realms and variants remain null.
UPDATE leaderboard_player_boss_subjects SET peak_encounter_id='00000000-0000-4000-8000-000000000010', peak_duration_ms=130000
WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND realm_id='00000000-0000-4000-8000-000000000002'
AND instance_name='Test raid' AND difficulty_name='' AND max_players=0 AND player_guid='Alice' AND encounter_name='Boss A';

-- Both halves are required; a nonpositive duration is rejected as well.
DO $$
BEGIN
 BEGIN
  UPDATE leaderboard_player_boss_subjects SET peak_duration_ms=0 WHERE peak_encounter_id IS NOT NULL;
  RAISE EXCEPTION 'expected positive-duration constraint';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE leaderboard_player_boss_subjects SET peak_duration_ms=NULL WHERE peak_encounter_id IS NOT NULL;
  RAISE EXCEPTION 'expected coherent-provenance constraint';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
