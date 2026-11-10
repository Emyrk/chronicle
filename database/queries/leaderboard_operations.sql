-- name: CreateLeaderboardOperation :one
INSERT INTO leaderboard_operations(tenant_id,requested_by,purpose,scope,run_id,after_date,before_date)
VALUES (@tenant_id,@requested_by,@purpose,@scope,sqlc.narg('run_id')::uuid,sqlc.narg('after_date')::date,@before_date::date) RETURNING *;

-- name: ListLeaderboardOperations :many
SELECT * FROM leaderboard_operations WHERE tenant_id= @tenant_id ORDER BY started_at DESC,id LIMIT 50;

-- name: GetLeaderboardOperation :one
SELECT * FROM leaderboard_operations WHERE id= @id AND tenant_id= @tenant_id;

-- name: LockLeaderboardOperation :one
SELECT * FROM leaderboard_operations WHERE id= @id AND tenant_id= @tenant_id FOR UPDATE;

-- name: PauseLeaderboardOperation :one
UPDATE leaderboard_operations SET state='paused'
WHERE id= @id AND tenant_id= @tenant_id AND state<>'completed' RETURNING *;

-- name: ResumeLeaderboardOperation :one
UPDATE leaderboard_operations SET state=CASE WHEN discovery_complete THEN 'draining' ELSE 'discovering' END,retry_after='-infinity'
WHERE id= @id AND tenant_id= @tenant_id AND state='paused' RETURNING *;

-- name: ActiveLeaderboardOperation :many
SELECT * FROM leaderboard_operations WHERE tenant_id= @tenant_id AND state<>'completed';

-- name: ListDueLeaderboardOperations :many
SELECT id,tenant_id FROM leaderboard_operations WHERE tenant_id> @after_tenant::uuid
AND state IN ('discovering','draining') AND retry_after<=clock_timestamp()
ORDER BY tenant_id LIMIT 100;

-- name: RetryLeaderboardOperation :exec
UPDATE leaderboard_operations SET retry_count=retry_count+1,last_error= @last_error,
retry_after=clock_timestamp()+interval '30 seconds' WHERE id= @id AND tenant_id= @tenant_id AND state<>'completed';

-- name: AdvanceLeaderboardOperation :exec
UPDATE leaderboard_operations SET cursor_realm= @cursor_realm,cursor_date= @cursor_date,cursor_id= @cursor_id,
phase= @phase,discovered=discovered+ @page_count::bigint,last_progress_at=clock_timestamp(),last_error=''
WHERE id= @id AND tenant_id= @tenant_id;

-- name: DrainLeaderboardOperation :exec
UPDATE leaderboard_operations SET discovery_complete=true,state='draining',last_progress_at=clock_timestamp()
WHERE id= @id AND tenant_id= @tenant_id;

-- name: CompleteLeaderboardOperation :exec
UPDATE leaderboard_operations o SET state='completed',completed_at=clock_timestamp(),last_progress_at=clock_timestamp()
WHERE o.id= @id AND o.tenant_id= @tenant_id AND state='draining' AND discovery_complete
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_runs d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_guild_boss_benchmarks d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_guild_boss_subjects d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_guild_clear_benchmarks d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_guild_clear_subjects d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_guild_renown d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_player_boss_benchmarks d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_player_boss_subjects d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_player_renown d WHERE d.tenant_id=o.tenant_id)
AND NOT EXISTS(SELECT 1 FROM leaderboard_dirty_careers d WHERE d.tenant_id=o.tenant_id AND d.required);

-- name: LookupLeaderboardOperation :one
-- Authorized admin lookup only; RLS still applies.
SELECT * FROM leaderboard_operations WHERE id= @id;

-- name: NextLeaderboardOperationRealm :one
SELECT r.id FROM wow_server_realms r JOIN wow_servers s ON s.id=r.server_id
WHERE s.tenant_id= @tenant_id::uuid AND r.id> @after_realm::uuid ORDER BY r.id LIMIT 1;

-- name: DiscoverLeaderboardOperationRuns :many
-- Event-time scope, not an ingestion snapshot. The existing realm/end index
-- supports a bounded chronological page; run_id breaks equal-date ties.
SELECT run_id,end_time FROM ranking_runs
WHERE realm_id= @realm_id
 AND (sqlc.narg('range_start')::timestamptz IS NULL OR end_time>=sqlc.narg('range_start')::timestamptz)
 AND end_time< @before_time::timestamptz
 AND EXISTS(SELECT 1 FROM wow_server_realms r JOIN wow_servers s ON s.id=r.server_id WHERE r.id=ranking_runs.realm_id AND s.tenant_id= @tenant_id::uuid)
 AND (end_time,run_id)>(@after_date::timestamptz,@after_id::uuid)
ORDER BY end_time,run_id LIMIT 100;

-- name: CountLeaderboardOperationMissingDates :one
SELECT count(*) FROM ranking_runs rr JOIN wow_server_realms r ON r.id=rr.realm_id
JOIN wow_servers s ON s.id=r.server_id WHERE s.tenant_id= @tenant_id::uuid AND rr.end_time IS NULL;

-- name: SetLeaderboardOperationMissingDates :exec
UPDATE leaderboard_operations SET missing_dates= @missing_dates WHERE id= @id AND tenant_id= @tenant_id;

-- name: LeaderboardOperationBacklog :one
WITH queues AS (
SELECT 'd1'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_runs WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_guild_boss_benchmarks WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_guild_boss_subjects WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_guild_clear_benchmarks WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_guild_clear_subjects WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_guild_renown WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_player_boss_benchmarks WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id= @tenant_id::uuid
UNION ALL
SELECT 'd2'::text AS level,count(*)::bigint AS pending,min(dirtied_at) AS oldest,coalesce(sum(attempts),0)::bigint AS retries FROM leaderboard_dirty_player_renown WHERE tenant_id= @tenant_id::uuid
) SELECT coalesce(sum(pending) FILTER(WHERE level='d1'),0)::bigint AS d1_pending,coalesce(sum(pending) FILTER(WHERE level='d2'),0)::bigint AS d2_pending,min(oldest)::timestamptz AS oldest_pending_at,sum(retries)::bigint AS pending_retries FROM queues;

-- name: AdvanceLeaderboardOperationPhase :exec
UPDATE leaderboard_operations SET phase= @phase,cursor_id='00000000-0000-0000-0000-000000000000',cursor_scope='{}',last_progress_at=clock_timestamp()
WHERE id= @id AND tenant_id= @tenant_id;

-- name: AdvanceLeaderboardOperationScope :exec
UPDATE leaderboard_operations SET cursor_scope= @cursor_scope::jsonb,discovered=discovered+ @page_count::bigint,last_progress_at=clock_timestamp(),last_error=''
WHERE id= @id AND tenant_id= @tenant_id;

-- name: DiscoverLeaderboardOperationEvidence :many
SELECT DISTINCT run_id FROM (
(SELECT DISTINCT run_id FROM leaderboard_player_observations WHERE tenant_id= @tenant_id::uuid AND observed_at<= @cutoff::timestamptz AND run_id> @after_id::uuid ORDER BY run_id LIMIT 100)
UNION ALL
(SELECT DISTINCT run_id FROM leaderboard_guild_boss_observations WHERE tenant_id= @tenant_id::uuid AND observed_at<= @cutoff::timestamptz AND run_id> @after_id::uuid ORDER BY run_id LIMIT 100)
UNION ALL
(SELECT DISTINCT run_id FROM leaderboard_guild_clear_observations WHERE tenant_id= @tenant_id::uuid AND observed_at<= @cutoff::timestamptz AND run_id> @after_id::uuid ORDER BY run_id LIMIT 100)
UNION ALL
(SELECT DISTINCT run_id FROM leaderboard_player_renown_facts WHERE tenant_id= @tenant_id::uuid AND observed_at<= @cutoff::timestamptz AND run_id> @after_id::uuid ORDER BY run_id LIMIT 100)
UNION ALL
(SELECT DISTINCT run_id FROM leaderboard_guild_renown_facts WHERE tenant_id= @tenant_id::uuid AND observed_at<= @cutoff::timestamptz AND run_id> @after_id::uuid ORDER BY run_id LIMIT 100)
) candidates ORDER BY run_id LIMIT 100;
