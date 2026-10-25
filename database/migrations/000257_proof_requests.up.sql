BEGIN;

-- Proof requests are reusable: purpose identifies the workflow, while each
-- subject records the entity being reviewed and its eventual outcome.
CREATE TABLE proof_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  evidence_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'partial')),
  message text NOT NULL DEFAULT '',
  response text NOT NULL DEFAULT '',
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  -- Decisions commit before object deletion. A failed delete leaves this set
  -- for the next admin request to retry, without losing the audit record.
  evidence_delete_pending boolean NOT NULL DEFAULT false,
  CHECK (purpose <> ''),
  CHECK (status = 'pending' OR reviewed_at IS NOT NULL)
);
CREATE INDEX proof_requests_applicant_created ON proof_requests (applicant_id, created_at DESC);
CREATE INDEX proof_requests_status_created ON proof_requests (status, created_at DESC);
CREATE INDEX proof_requests_evidence_cleanup ON proof_requests (id) WHERE evidence_delete_pending;

CREATE TABLE proof_request_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES proof_requests(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  realm_id uuid REFERENCES wow_server_realms(id),
  character_guid wow_guid,
  name text NOT NULL,
  realm_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  warning text NOT NULL DEFAULT '',
  CHECK (subject_type <> ''),
  CHECK (subject_type <> 'character' OR (realm_id IS NOT NULL AND character_guid IS NOT NULL)),
  UNIQUE (request_id, realm_id, character_guid)
);
-- A character may have only one open proof request, even across applicants.
CREATE UNIQUE INDEX proof_request_subjects_pending_character
  ON proof_request_subjects (realm_id, character_guid)
  WHERE subject_type = 'character' AND status = 'pending';

COMMIT;
