BEGIN;
-- Nullable provenance for the same observation that supplied raw_peak. Existing
-- summaries remain readable while an in-place repair supplies these fields.
-- NOT VALID avoids a startup scan of existing summaries; new/updated rows are
-- still checked and old rows necessarily receive two NULLs.
-- No FK to source logs: retention/deletion must never be blocked by summaries.
ALTER TABLE leaderboard_player_boss_subjects
 ADD COLUMN peak_encounter_id uuid,
 ADD COLUMN peak_duration_ms bigint,
 ADD CONSTRAINT leaderboard_player_peak_provenance_complete CHECK (
  (peak_encounter_id IS NULL AND peak_duration_ms IS NULL) OR
  (peak_encounter_id IS NOT NULL AND peak_duration_ms IS NOT NULL AND peak_duration_ms > 0)
 ) NOT VALID;
COMMIT;
