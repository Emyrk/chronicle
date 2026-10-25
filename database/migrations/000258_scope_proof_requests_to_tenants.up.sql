BEGIN;

-- Legacy proof requests (if any) belong to the root domain. New submissions
-- always supply the resolved tenant ID. Zero UUID is the root sentinel.
ALTER TABLE proof_requests
  ADD COLUMN tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
-- The default only backfills legacy rows; every new request must explicitly
-- provide its resolved tenant ID.
ALTER TABLE proof_requests ALTER COLUMN tenant_id DROP DEFAULT;

CREATE INDEX proof_requests_tenant_applicant_created
  ON proof_requests (tenant_id, applicant_id, created_at DESC);
CREATE INDEX proof_requests_tenant_status_created
  ON proof_requests (tenant_id, status, created_at DESC);

COMMIT;
