-- name: EnqueueLeaderboardRun :exec
INSERT INTO leaderboard_dirty_runs (tenant_id,run_id,process_after)
VALUES (@tenant_id::uuid,@run_id::uuid,@process_after::timestamptz)
ON CONFLICT (tenant_id,run_id) DO UPDATE SET revision=leaderboard_dirty_runs.revision+1,
 dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_runs.process_after,EXCLUDED.process_after);

-- name: ClaimLeaderboardRun :many
WITH candidate AS (
 SELECT * FROM leaderboard_dirty_runs WHERE tenant_id= @tenant_id::uuid
 AND process_after<=clock_timestamp() AND retry_after<=clock_timestamp()
 AND (locked_until IS NULL OR locked_until<=clock_timestamp())
 ORDER BY process_after,run_id LIMIT 1 FOR UPDATE SKIP LOCKED
)
UPDATE leaderboard_dirty_runs d SET claim_token=gen_random_uuid(),claimed_revision=d.revision,
 locked_until=clock_timestamp()+interval '15 minutes'
FROM candidate c WHERE d.tenant_id=c.tenant_id AND d.run_id=c.run_id RETURNING d.*;

-- name: LockLeaderboardRunClaim :one
SELECT * FROM leaderboard_dirty_runs WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid
 AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint
 AND locked_until>clock_timestamp() FOR UPDATE;

-- name: LeaderboardRunClaimUnexpired :one
SELECT EXISTS(SELECT 1 FROM leaderboard_dirty_runs WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid
 AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint AND locked_until>clock_timestamp())::boolean;

-- name: AcknowledgeLeaderboardRun :exec
WITH removed AS (
 DELETE FROM leaderboard_dirty_runs WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid
 AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint AND revision=claimed_revision RETURNING 1
)
UPDATE leaderboard_dirty_runs SET claim_token=NULL,claimed_revision=NULL,locked_until=NULL,attempts=0,retry_after='-infinity'
WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid
 AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint AND revision<>claimed_revision;

-- name: RetryLeaderboardRun :exec
UPDATE leaderboard_dirty_runs SET claim_token=NULL,claimed_revision=NULL,locked_until=NULL,
 attempts=LEAST(attempts+1,30),retry_after=clock_timestamp()+make_interval(secs=>LEAST(300,5*power(2,LEAST(attempts,6)))::double precision)
WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint;

-- name: ListDueLeaderboardRuns :many
SELECT DISTINCT tenant_id FROM leaderboard_dirty_runs WHERE tenant_id> @after_tenant::uuid
 AND process_after<=clock_timestamp() AND retry_after<=clock_timestamp()
 AND (locked_until IS NULL OR locked_until<=clock_timestamp())
ORDER BY tenant_id LIMIT @limit_count::integer;

-- name: LockLeaderboardDirectPublication :one
-- Future direct writers call BEFORE source mutation in the same transaction.
-- An overlap increments revision without invalidating the active owner's token.
-- A new row is only a serialization placeholder; remove it after publication.
INSERT INTO leaderboard_dirty_runs (tenant_id,run_id) VALUES (@tenant_id::uuid,@run_id::uuid)
ON CONFLICT (tenant_id,run_id) DO UPDATE SET
 revision=leaderboard_dirty_runs.revision+CASE WHEN leaderboard_dirty_runs.claim_token IS NOT NULL THEN 1 ELSE 0 END,
 dirtied_at=clock_timestamp()
RETURNING (xmax=0)::boolean AS created;

-- name: RemoveLeaderboardDirectPlaceholder :exec
DELETE FROM leaderboard_dirty_runs WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid AND claim_token IS NULL AND revision=1;
