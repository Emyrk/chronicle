BEGIN;
-- No rows are copied or rewritten at startup. Missing rows use the legacy reader
-- when an active generation exists, otherwise the evolving reader.
CREATE TABLE tenant_rating_read_states (
    tenant_id UUID PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('legacy', 'copying', 'evolving')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tenant_rating_read_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_rating_read_states FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON tenant_rating_read_states
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON tenant_rating_read_states
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));
COMMIT;
