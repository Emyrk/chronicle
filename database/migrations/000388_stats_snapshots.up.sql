BEGIN;

-- Precomputed payloads for the public /stats answer pages, one row per tenant
-- and page. A new, empty table: no existing rows are scanned or rewritten.
-- tenant_id is uuid.Nil for the root site, like the other per-tenant tables.
CREATE TABLE stats_snapshots (
  tenant_id uuid NOT NULL,
  page_key text NOT NULL,
  payload jsonb NOT NULL,
  sample_n integer NOT NULL,
  computed_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, page_key)
);

ALTER TABLE stats_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stats_snapshots
  USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
  WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE POLICY tenant_admin_bypass ON stats_snapshots
  USING (current_setting('app.tenant_bypass', true) = 'true')
  WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');

COMMIT;
