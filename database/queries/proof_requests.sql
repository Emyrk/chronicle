-- name: InsertProofRequest :one
INSERT INTO proof_requests (id, applicant_id, purpose, evidence_key, message, tenant_id)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: InsertProofSubject :exec
INSERT INTO proof_request_subjects (request_id, subject_type, realm_id, character_guid, name, realm_name)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListMyProofRequests :many
SELECT * FROM proof_requests WHERE applicant_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 100;

-- name: ListAdminProofRequests :many
SELECT * FROM proof_requests WHERE tenant_id = $1 ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200;

-- name: ListAllProofRequests :many
-- Root-domain site admins only: caller must use AdminBypass to include tenants
-- excluded by root-domain RLS.
SELECT * FROM proof_requests ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200;

-- name: GetProofRequest :one
SELECT * FROM proof_requests WHERE id = $1;

-- name: GetTenantProofRequest :one
SELECT * FROM proof_requests WHERE id = $1 AND tenant_id = $2;

-- name: LockPendingProofRequest :one
SELECT * FROM proof_requests WHERE id = $1 AND tenant_id = $2 AND status = 'pending' FOR UPDATE;

-- name: LockPendingProofRequestByID :one
-- Root-domain site admins only (AdminBypass context).
SELECT * FROM proof_requests WHERE id = $1 AND status = 'pending' FOR UPDATE;

-- name: ListProofSubjects :many
SELECT * FROM proof_request_subjects WHERE request_id = $1 ORDER BY id;

-- name: ListProofSubjectClasses :many
-- Resolve current armory classes in one query per request; old requests and
-- characters removed from the armory still render without a class color.
SELECT s.id AS subject_id, gp.class
FROM proof_request_subjects s
JOIN game_players gp ON gp.realm_id = s.realm_id AND gp.id = s.character_guid
WHERE s.request_id = $1;

-- name: DecideProofSubject :execrows
UPDATE proof_request_subjects SET status = $2, warning = $3 WHERE id = $1 AND status = 'pending';

-- name: DecideProofRequest :execrows
UPDATE proof_requests SET status = $2, response = $3, reviewer_id = $4,
  reviewed_at = now(), evidence_delete_pending = true
WHERE id = $1 AND status = 'pending';

-- name: ListProofEvidenceCleanup :many
SELECT * FROM proof_requests WHERE evidence_delete_pending AND tenant_id = $1 ORDER BY reviewed_at LIMIT 20;

-- name: ListAllProofEvidenceCleanup :many
SELECT * FROM proof_requests WHERE evidence_delete_pending ORDER BY reviewed_at LIMIT 20;

-- name: CompleteProofEvidenceCleanup :exec
UPDATE proof_requests SET evidence_delete_pending = false, evidence_key = ''
WHERE id = $1 AND tenant_id = $2 AND evidence_delete_pending;
