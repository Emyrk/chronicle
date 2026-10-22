BEGIN;

ALTER TABLE inference_runs
  ADD COLUMN lease_expires_at TIMESTAMPTZ;

ALTER TABLE inference_connections
  ALTER COLUMN encrypted_credential DROP NOT NULL;

UPDATE inference_runs
SET status = 'abandoned',
    error_code = 'stale_run',
    completed_at = now(),
    updated_at = now()
WHERE status = 'running';

CREATE UNIQUE INDEX inference_runs_one_running_per_thread_idx
  ON inference_runs(thread_id)
  WHERE status = 'running' AND thread_id IS NOT NULL;

CREATE INDEX inference_runs_stale_idx
  ON inference_runs(lease_expires_at)
  WHERE status = 'running';

COMMIT;
