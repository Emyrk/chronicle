BEGIN;
-- Operator-triggered and empty by default. One cursor per source family and tenant.
CREATE TABLE rating_policy_scan_progress (
    tenant_id uuid NOT NULL,
    stage text NOT NULL CHECK (stage IN ('runs','renown','mastery','peak')),
    after_key jsonb,
    completed boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, stage)
);
ALTER TABLE rating_policy_scan_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_policy_scan_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_policy_scan_progress
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_policy_scan_progress
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));
COMMIT;
