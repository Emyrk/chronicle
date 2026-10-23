BEGIN;

DROP INDEX IF EXISTS inference_runs_stale_idx;
DROP INDEX IF EXISTS inference_runs_one_running_per_thread_idx;
ALTER TABLE inference_runs DROP COLUMN lease_expires_at;
DELETE FROM inference_connections WHERE encrypted_credential IS NULL;
ALTER TABLE inference_connections ALTER COLUMN encrypted_credential SET NOT NULL;

COMMIT;
