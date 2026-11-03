BEGIN;

ALTER TABLE inference_runs DROP CONSTRAINT inference_runs_ephemeral_history_check;
ALTER TABLE inference_runs DROP COLUMN ephemeral_history;
DELETE FROM inference_client_tool_requests WHERE thread_id IS NULL;
ALTER TABLE inference_client_tool_requests ALTER COLUMN thread_id SET NOT NULL;

COMMIT;
