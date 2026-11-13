BEGIN;

-- Additive audit storage only. No existing events or instances are rewritten.
CREATE TABLE event_repair_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  version integer NOT NULL,
  state text NOT NULL DEFAULT 'dry_running' CHECK (state IN ('dry_running', 'ready', 'applying', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  selection jsonb NOT NULL,
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  applied integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT ''
);
CREATE INDEX event_repair_operations_history ON event_repair_operations (tenant_id, created_at DESC, id);

CREATE TABLE event_repair_items (
  operation_id uuid NOT NULL REFERENCES event_repair_operations(id) ON DELETE CASCADE,
  -- Retain audit evidence even when the source instance is deleted.
  instance_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready', 'skipped', 'applied', 'stale')),
  reason text NOT NULL DEFAULT '',
  evidence_hash text NOT NULL DEFAULT '',
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (operation_id, instance_id)
);
CREATE INDEX event_repair_items_work ON event_repair_items (operation_id, state, instance_id);

ALTER TABLE event_repair_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_repair_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON event_repair_operations
  USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
  WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE POLICY tenant_admin_bypass ON event_repair_operations
  USING (current_setting('app.tenant_bypass', true) = 'true')
  WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');

ALTER TABLE event_repair_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_repair_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON event_repair_items
  USING (EXISTS (SELECT 1 FROM event_repair_operations o WHERE o.id = operation_id AND o.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)))
  WITH CHECK (EXISTS (SELECT 1 FROM event_repair_operations o WHERE o.id = operation_id AND o.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE POLICY tenant_admin_bypass ON event_repair_items
  USING (current_setting('app.tenant_bypass', true) = 'true')
  WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');

COMMIT;
