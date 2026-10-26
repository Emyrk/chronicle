BEGIN;

ALTER TABLE tenants
DROP COLUMN wow_logs_forwarding_enabled;

COMMIT;
