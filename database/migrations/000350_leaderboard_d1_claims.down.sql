ALTER TABLE leaderboard_dirty_runs
 DROP CONSTRAINT leaderboard_dirty_runs_claim_complete,
 DROP COLUMN claim_token, DROP COLUMN claimed_revision, DROP COLUMN locked_until,
 DROP COLUMN retry_after, DROP COLUMN attempts;
