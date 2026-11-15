-- Protocol and transaction requirements: database/PARSER_HANDOFF.md.

-- name: EnsureParserHandoff :exec
-- Caller holds the wow_log_groups row lock and supplies its current
-- parse_generation as initial_generation in this same transaction.
INSERT INTO parser_handoffs (log_group_id, generation)
VALUES (@log_group_id, @initial_generation::bigint)
ON CONFLICT (log_group_id) DO NOTHING;

-- name: GetParserHandoff :one
SELECT * FROM parser_handoffs WHERE log_group_id = @log_group_id;

-- name: AdvanceParserHandoffGeneration :one
UPDATE parser_handoffs
SET generation = generation + 1, parse_lease_token = NULL, parse_lease_expires_at = NULL,
    publication_token = NULL, publication_expires_at = NULL
WHERE log_group_id = @log_group_id AND generation = @expected_generation
RETURNING *;

-- name: ClaimParserHandoffLease :one
UPDATE parser_handoffs
SET parse_lease_token = @lease_token::uuid,
    parse_lease_expires_at = clock_timestamp() + @lease_duration::interval
WHERE log_group_id = @log_group_id AND generation = @generation
  AND @lease_duration::interval > interval '0 seconds'
  AND (parse_lease_token IS NULL OR parse_lease_expires_at <= clock_timestamp())
RETURNING *;

-- name: RenewParserHandoffLease :one
UPDATE parser_handoffs
SET parse_lease_expires_at = clock_timestamp() + @lease_duration::interval
WHERE log_group_id = @log_group_id AND generation = @generation
  AND parse_lease_token = @lease_token::uuid
  AND parse_lease_expires_at > clock_timestamp()
  AND @lease_duration::interval > interval '0 seconds'
RETURNING *;

-- name: ReleaseParserHandoffLease :one
UPDATE parser_handoffs
SET parse_lease_token = NULL, parse_lease_expires_at = NULL
WHERE log_group_id = @log_group_id AND generation = @generation
  AND parse_lease_token = @lease_token::uuid
RETURNING *;

-- Lock first, then insert, advance, and River enqueue in the SAME transaction.
-- name: LockParserHandoffForAcceptance :one
SELECT * FROM parser_handoffs
WHERE log_group_id = @log_group_id AND generation = @generation
  AND parse_lease_token = @lease_token::uuid
  AND parse_lease_expires_at > clock_timestamp()
  AND head_iteration = @predecessor_iteration
  AND head_attempt_id IS NOT DISTINCT FROM sqlc.narg(predecessor_attempt_id)::uuid
FOR UPDATE;

-- name: InsertParserCheckpointAttempt :one
INSERT INTO parser_checkpoint_attempts (
  attempt_id, log_group_id, generation, iteration, predecessor_attempt_id,
  producing_binary, dataset_identity, input_identity, parser_engine, object_key, object_digest
)
SELECT @attempt_id::uuid, h.log_group_id, h.generation, h.head_iteration + 1, h.head_attempt_id,
       @producing_binary, @dataset_identity::jsonb, @input_identity::jsonb,
       @parser_engine, @object_key, @object_digest
FROM parser_handoffs AS h
WHERE h.log_group_id = @log_group_id AND h.generation = @generation
  AND h.parse_lease_token = @lease_token::uuid
  AND h.parse_lease_expires_at > clock_timestamp()
  AND h.head_iteration = @predecessor_iteration
  AND h.head_attempt_id IS NOT DISTINCT FROM sqlc.narg(predecessor_attempt_id)::uuid
RETURNING *;

-- name: AdvanceParserHandoffHead :one
UPDATE parser_handoffs AS h
SET head_iteration = a.iteration, head_attempt_id = a.attempt_id
FROM parser_checkpoint_attempts AS a
WHERE h.log_group_id = @log_group_id AND h.generation = @generation
  AND h.parse_lease_token = @lease_token::uuid
  AND h.parse_lease_expires_at > clock_timestamp()
  AND h.head_iteration = @predecessor_iteration
  AND h.head_attempt_id IS NOT DISTINCT FROM sqlc.narg(predecessor_attempt_id)::uuid
  AND a.log_group_id = h.log_group_id AND a.generation = h.generation
  AND a.attempt_id = @attempt_id::uuid AND a.iteration = h.head_iteration + 1
  AND a.predecessor_attempt_id IS NOT DISTINCT FROM h.head_attempt_id
RETURNING h.*;

-- Explicit log deletion only. Caller holds the log-generation row lock until
-- object removal and the metadata cascade commit, preventing late acceptance.
-- name: ListParserCheckpointAttemptsForDeletion :many
SELECT * FROM parser_checkpoint_attempts
WHERE log_group_id = @log_group_id AND iteration > @after_iteration
ORDER BY iteration
LIMIT 100;

-- name: GetParserCheckpointAttempt :one
SELECT * FROM parser_checkpoint_attempts
WHERE log_group_id = @log_group_id AND attempt_id = @attempt_id::uuid;

-- Reservation authority is independent of parse head, but an explicit new
-- generation invalidates prior attempts and tokens. Active claims serialize.
-- name: ClaimParserPublication :one
UPDATE parser_handoffs AS h
SET publication_iteration = a.iteration,
    publication_token = @publication_token::uuid,
    publication_expires_at = clock_timestamp() + @lease_duration::interval
FROM parser_checkpoint_attempts AS a
WHERE h.log_group_id = @log_group_id
  AND a.log_group_id = h.log_group_id AND a.attempt_id = @attempt_id::uuid
  AND a.generation = h.generation
  AND a.iteration <= h.head_iteration
  AND a.iteration > h.published_iteration
  AND a.iteration >= h.publication_iteration
  AND @lease_duration::interval > interval '0 seconds'
  AND (h.publication_token IS NULL OR h.publication_expires_at <= clock_timestamp())
RETURNING h.*;

-- name: RenewParserPublication :one
UPDATE parser_handoffs
SET publication_expires_at = clock_timestamp() + @lease_duration::interval
WHERE log_group_id = @log_group_id AND generation = @generation
  AND publication_iteration = @iteration
  AND publication_token = @publication_token::uuid
  AND publication_expires_at > clock_timestamp()
  AND @lease_duration::interval > interval '0 seconds'
RETURNING *;

-- Must be first operation in EVERY publication transaction. Hold this row lock
-- through all serving writes and the final token check. No parse-head predicate.
-- name: LockParserPublication :one
SELECT * FROM parser_handoffs
WHERE log_group_id = @log_group_id AND generation = @generation
  AND publication_iteration = @iteration
  AND publication_iteration > published_iteration
  AND publication_token = @publication_token::uuid
  AND publication_expires_at > clock_timestamp()
FOR UPDATE;

-- Use after writes in intermediate publication transactions. Zero rows means
-- roll back ALL writes. A final publication transaction uses Complete instead.
-- name: CheckParserPublication :one
SELECT * FROM parser_handoffs
WHERE log_group_id = @log_group_id AND generation = @generation
  AND publication_iteration = @iteration
  AND publication_iteration > published_iteration
  AND publication_token = @publication_token::uuid
  AND publication_expires_at > clock_timestamp()
FOR UPDATE;

-- name: CompleteParserPublication :one
UPDATE parser_handoffs
SET published_iteration = publication_iteration,
    publication_token = NULL, publication_expires_at = NULL
WHERE log_group_id = @log_group_id AND generation = @generation
  AND publication_iteration = @iteration
  AND publication_iteration > published_iteration
  AND publication_token = @publication_token::uuid
  AND publication_expires_at > clock_timestamp()
RETURNING *;

-- Release preserves the high-water iteration, even after expiry or failure.
-- name: ReleaseParserPublication :one
UPDATE parser_handoffs
SET publication_token = NULL, publication_expires_at = NULL
WHERE log_group_id = @log_group_id AND generation = @generation
  AND publication_iteration = @iteration
  AND publication_token = @publication_token::uuid
RETURNING *;

-- name: SetParserHandoffNativeEnabled :exec
UPDATE parser_handoffs
SET native_enabled = @native_enabled::boolean
WHERE log_group_id = @log_group_id;
