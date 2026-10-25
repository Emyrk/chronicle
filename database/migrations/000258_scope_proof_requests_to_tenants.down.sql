BEGIN;

DROP INDEX proof_requests_tenant_status_created;
DROP INDEX proof_requests_tenant_applicant_created;
ALTER TABLE proof_requests DROP COLUMN tenant_id;

COMMIT;
