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
SET status = 'deleted', updated_at = now()
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
INSERT INTO inference_messages (thread_id, role, content, tool_call_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListInferenceMessagesByThread :many
SELECT * FROM inference_messages
WHERE thread_id = $1
ORDER BY created_at, id;

-- name: InsertInferenceRun :one
INSERT INTO inference_runs (
  thread_id, user_id, connection_id, assistant_id, model, status,
  idempotency_key, input_tokens, output_tokens, error_code, completed_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: GetOrCreateInferenceThread :one
INSERT INTO inference_threads (
  user_id, assistant_id, persistence, context_type, context_id, title
) VALUES ($1, $2, 'durable', $3, $4, $5)
ON CONFLICT (user_id, assistant_id, context_type, context_id)
  WHERE persistence = 'durable' AND context_type IS NOT NULL
DO UPDATE SET updated_at = inference_threads.updated_at
RETURNING *;
