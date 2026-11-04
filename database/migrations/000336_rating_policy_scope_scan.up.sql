BEGIN;
ALTER TABLE rating_policy_scan_progress DROP CONSTRAINT rating_policy_scan_progress_stage_check;
ALTER TABLE rating_policy_scan_progress ADD CONSTRAINT rating_policy_scan_progress_stage_check
    CHECK (stage IN ('runs','renown','mastery','peak','player_scope','guild_scope'));
COMMIT;
