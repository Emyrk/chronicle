BEGIN;

DROP TABLE inference_client_tool_requests;

DROP INDEX inference_runs_stale_idx;
CREATE INDEX inference_runs_stale_idx
  ON inference_runs(lease_expires_at)
  WHERE status = 'running';

DROP INDEX inference_runs_one_active_per_thread_idx;
CREATE UNIQUE INDEX inference_runs_one_running_per_thread_idx
  ON inference_runs(thread_id)
  WHERE status = 'running' AND thread_id IS NOT NULL;

ALTER TABLE inference_runs
  DROP COLUMN tool_call_count,
  DROP COLUMN iteration_count,
  DROP COLUMN debug;

COMMIT;
