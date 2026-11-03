BEGIN;

ALTER TABLE inference_client_tool_requests ALTER COLUMN thread_id DROP NOT NULL;
ALTER TABLE inference_runs ADD COLUMN ephemeral_history JSONB;
ALTER TABLE inference_runs ADD CONSTRAINT inference_runs_ephemeral_history_check CHECK (
  ephemeral_history IS NULL OR (thread_id IS NULL AND assistant_id = 'site-help' AND status = 'awaiting_client_tool'
    AND jsonb_typeof(ephemeral_history) = 'array' AND jsonb_array_length(ephemeral_history) <= 70
    AND pg_column_size(ephemeral_history) <= 262144)
) NOT VALID;

COMMIT;
