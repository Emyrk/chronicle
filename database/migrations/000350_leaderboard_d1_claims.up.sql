ALTER TABLE leaderboard_dirty_runs
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_runs_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );