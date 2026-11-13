BEGIN;

-- Additive permanent per-script receipts. No scan/backfill of historical sources.
CREATE TABLE event_repair_receipts (
  instance_id uuid NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
  operation text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  -- Deliberately not an audit-operation FK: deleting job history must not permit
  -- the same script to run again or erase its public receipt.
  operation_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  PRIMARY KEY (instance_id, operation)
);
CREATE INDEX event_repair_receipts_tenant ON event_repair_receipts (tenant_id, instance_id);
ALTER TABLE event_repair_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_repair_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_read ON event_repair_receipts FOR SELECT USING (
  EXISTS (SELECT 1 FROM log_instances i
    JOIN wow_server_realms r ON r.id = i.realm_id
    JOIN wow_servers s ON s.id = r.server_id
    WHERE i.id = instance_id AND s.tenant_id = event_repair_receipts.tenant_id)
);
CREATE POLICY receipt_tenant_write ON event_repair_receipts FOR INSERT WITH CHECK (
  tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND EXISTS (SELECT 1 FROM log_instances i JOIN wow_server_realms r ON r.id=i.realm_id
    JOIN wow_servers s ON s.id=r.server_id WHERE i.id=instance_id AND s.tenant_id=event_repair_receipts.tenant_id)
);
CREATE POLICY receipt_admin_bypass ON event_repair_receipts
 USING (current_setting('app.tenant_bypass', true) = 'true')
 WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');

COMMIT;
