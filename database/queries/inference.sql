-- name: InsertInferenceConnection :one
INSERT INTO inference_connections (
  user_id, provider, auth_mode, label, encrypted_credential,
  credential_key_version, provider_account_key_hash, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListInferenceConnectionsByOwner :many
SELECT * FROM inference_connections
WHERE user_id = $1 AND status <> 'deleted'
ORDER BY created_at DESC;

-- name: GetInferenceConnectionByOwner :one
SELECT * FROM inference_connections
WHERE id = $1 AND user_id = $2 AND status <> 'deleted';

-- name: DeleteInferenceConnectionByOwner :exec
UPDATE inference_connections
SET status = 'deleted',
    encrypted_credential = NULL,
    provider_account_key_hash = NULL,
    updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: UpdateInferenceConnectionLastUsedByOwner :one
UPDATE inference_connections
SET last_used_at = now(), updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: InsertInferenceOAuthTransaction :one
INSERT INTO inference_oauth_transactions (
  user_id, provider, state_hash, encrypted_verifier, verifier_key_version,
  return_path, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ConsumeInferenceOAuthTransaction :one
DELETE FROM inference_oauth_transactions
WHERE state_hash = $1 AND user_id = $2 AND expires_at > now()
RETURNING *;

-- name: InsertInferenceThread :one
INSERT INTO inference_threads (
  user_id, assistant_id, persistence, context_type, context_id, title
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetInferenceThreadByOwner :one
SELECT * FROM inference_threads
WHERE id = $1 AND user_id = $2;

-- name: ListInferenceThreadsByOwner :many
SELECT * FROM inference_threads
WHERE user_id = $1
ORDER BY updated_at DESC;

-- name: UpdateInferenceThreadTitleByOwner :one
UPDATE inference_threads
SET title = $3, updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: InsertInferenceMessage :one
WITH inserted AS (
  INSERT INTO inference_messages (thread_id, role, content, tool_call_id, created_at)
  VALUES ($1, $2, $3, $4, clock_timestamp())
  RETURNING *
), touched AS (
  UPDATE inference_threads
  SET updated_at = now()
  WHERE id = $1
)
SELECT * FROM inserted;

-- name: ListRecentInferenceMessagesByThread :many
SELECT *
FROM (
  SELECT * FROM inference_messages
  WHERE thread_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT $2
) recent
ORDER BY created_at, id;

-- name: InsertInferenceRun :one
INSERT INTO inference_runs (
  thread_id, user_id, connection_id, assistant_id, model, status,
  idempotency_key, input_tokens, output_tokens, error_code, completed_at,
  lease_expires_at, debug, iteration_count, tool_call_count
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING *;

-- name: GetInferenceRunByOwner :one
SELECT * FROM inference_runs
WHERE id = $1 AND user_id = $2;

-- name: GetInferenceRunByIdempotencyKey :one
SELECT * FROM inference_runs
WHERE user_id = $1 AND idempotency_key = $2;

-- name: UpdateInferenceRun :one
UPDATE inference_runs
SET status = $3,
    input_tokens = $4,
    output_tokens = $5,
    error_code = $6,
    completed_at = $7,
    iteration_count = $8,
    tool_call_count = $9,
    lease_expires_at = NULL,
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: ExpireStaleInferenceRuns :one
WITH stale AS (
  UPDATE inference_runs
  SET status = 'abandoned',
      error_code = 'stale_run',
      completed_at = now(),
      updated_at = now()
  WHERE status IN ('running', 'awaiting_client_tool')
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at <= now()
  RETURNING id
), expired AS (
  UPDATE inference_client_tool_requests
  SET status = 'expired', updated_at = now(), completed_at = now()
  WHERE status = 'pending' AND run_id IN (SELECT id FROM stale)
  RETURNING run_id
)
SELECT count(*)::bigint FROM stale;

-- name: InsertInferenceClientToolRequest :one
INSERT INTO inference_client_tool_requests (
  run_id, thread_id, tool_call_id, tool_name, arguments,
  capability_id, capability_version, scope_type, scope_id,
  client_session_id, state_revision, effect, confirmation
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetInferenceClientToolRequestForUpdate :one
SELECT request.*
FROM inference_client_tool_requests request
JOIN inference_runs run ON run.id = request.run_id
WHERE request.run_id = $1
  AND request.tool_call_id = $2
  AND run.user_id = $3
FOR UPDATE OF request;

-- name: GetPendingInferenceClientToolRequestByThreadForUpdate :one
SELECT request.*
FROM inference_client_tool_requests request
JOIN inference_runs run ON run.id = request.run_id
WHERE request.thread_id = $1
  AND request.status = 'pending'
  AND run.user_id = $2
  AND run.status = 'awaiting_client_tool'
FOR UPDATE OF request;

-- name: ExpireInferenceClientToolRequest :one
UPDATE inference_client_tool_requests
SET status = 'expired', updated_at = now(), completed_at = now()
WHERE run_id = $1 AND tool_call_id = $2 AND status = 'pending'
RETURNING *;

-- name: AbandonAwaitingInferenceRun :one
UPDATE inference_runs
SET status = 'abandoned',
    error_code = 'client_tool_superseded',
    completed_at = now(),
    lease_expires_at = NULL,
    updated_at = now()
WHERE id = $1 AND user_id = $2 AND status = 'awaiting_client_tool'
RETURNING *;

-- name: CompleteInferenceClientToolRequest :one
UPDATE inference_client_tool_requests
SET status = 'completed', updated_at = now(), completed_at = now()
WHERE run_id = $1 AND tool_call_id = $2 AND status = 'pending'
RETURNING *;

-- name: PauseInferenceRun :one
UPDATE inference_runs
SET status = 'awaiting_client_tool',
    input_tokens = $3,
    output_tokens = $4,
    iteration_count = $5,
    tool_call_count = $6,
    lease_expires_at = $7,
    updated_at = now()
WHERE id = $1 AND user_id = $2 AND status = 'running'
RETURNING *;

-- name: ResumeInferenceRun :one
UPDATE inference_runs
SET status = 'running', lease_expires_at = $3, updated_at = now()
WHERE id = $1 AND user_id = $2 AND status = 'awaiting_client_tool'
RETURNING *;

-- name: ListInferenceInstanceEncounters :many
SELECT *
FROM log_instance_encounters
WHERE instance_id = $1
ORDER BY start_time, id
LIMIT 100;

-- name: ListInferenceInstancePlayers :many
SELECT *
FROM log_instance_players
WHERE instance_id = $1
ORDER BY name, unit_guid
LIMIT 100;

-- name: GetOrCreateInferenceThread :one
INSERT INTO inference_threads (
  user_id, assistant_id, persistence, context_type, context_id, title
) VALUES ($1, $2, 'durable', $3, $4, $5)
ON CONFLICT (user_id, assistant_id, context_type, context_id)
  WHERE persistence = 'durable' AND context_type IS NOT NULL
DO UPDATE SET updated_at = inference_threads.updated_at
RETURNING *;
