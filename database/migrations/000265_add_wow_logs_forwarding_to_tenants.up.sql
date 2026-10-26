BEGIN;

ALTER TABLE tenants
ADD COLUMN wow_logs_forwarding_enabled BOOLEAN NOT NULL DEFAULT false;

COMMIT;
