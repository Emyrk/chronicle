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
