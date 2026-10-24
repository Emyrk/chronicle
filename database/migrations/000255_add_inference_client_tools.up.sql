BEGIN;

ALTER TABLE inference_runs
  ADD COLUMN debug BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN iteration_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN tool_call_count INTEGER NOT NULL DEFAULT 0;

DROP INDEX inference_runs_one_running_per_thread_idx;
CREATE UNIQUE INDEX inference_runs_one_active_per_thread_idx
  ON inference_runs(thread_id)
  WHERE status IN ('running', 'awaiting_client_tool') AND thread_id IS NOT NULL;

DROP INDEX inference_runs_stale_idx;
CREATE INDEX inference_runs_stale_idx
  ON inference_runs(lease_expires_at)
  WHERE status IN ('running', 'awaiting_client_tool');

CREATE TABLE inference_client_tool_requests (
  run_id UUID NOT NULL REFERENCES inference_runs(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES inference_threads(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments JSONB NOT NULL,
  capability_id TEXT NOT NULL,
  capability_version INTEGER NOT NULL,
  scope_type TEXT,
  scope_id TEXT,
  client_session_id TEXT NOT NULL,
  state_revision BIGINT,
  effect TEXT NOT NULL,
  confirmation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, tool_call_id),
  CHECK ((scope_type IS NULL) = (scope_id IS NULL)),
  CHECK (state_revision IS NULL OR state_revision >= 0),
  CHECK (effect IN ('read', 'view_mutation')),
  CHECK (confirmation IN ('never', 'unless_yolo')),
  CHECK (status IN ('pending', 'completed', 'expired'))
);

CREATE UNIQUE INDEX inference_client_tool_requests_one_pending_per_run_idx
  ON inference_client_tool_requests(run_id)
  WHERE status = 'pending';

COMMIT;
