-- name: ListRiverQueueMetrics :many
SELECT
  queue,
  state::text AS state,
  COUNT(*) AS job_count,
  GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))), 0)::double precision AS oldest_job_age_seconds
FROM river_job
WHERE state IN ('available', 'pending', 'retryable', 'running', 'scheduled')
GROUP BY queue, state
ORDER BY queue, state;

-- name: AdminListRatingRebuildJobs :many
-- The most recent tenant rating rebuild jobs with their timing and the
-- worker's last progress snapshot (metadata.output), for the admin page.
SELECT j.id, j.state::text AS state, j.attempt, j.created_at, j.attempted_at, j.finalized_at,
       COALESCE(j.args->>'tenant_id', '')::text AS tenant_id, COALESCE(t.name, '')::text AS tenant_name,
       COALESCE(j.metadata->'output', '{}'::jsonb)::jsonb AS output,
       COALESCE(j.errors[array_length(j.errors, 1)]->>'error', '')::text AS last_error
FROM river_job j
LEFT JOIN tenants t ON t.id::text = j.args->>'tenant_id'
WHERE j.kind = 'rebuild-tenant-ratings'
ORDER BY j.id DESC
LIMIT LEAST(GREATEST(@limit_count::int, 1), 200);
