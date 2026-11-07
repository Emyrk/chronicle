BEGIN;
ALTER TABLE leaderboard_player_boss_subjects
 DROP CONSTRAINT leaderboard_player_peak_provenance_complete,
 DROP COLUMN peak_encounter_id,
 DROP COLUMN peak_duration_ms;
COMMIT;
