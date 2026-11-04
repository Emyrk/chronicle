BEGIN;
-- Reconciliation stamps allow a bounded daily source/version audit to queue
-- only runs whose canonical representative changed (or disappeared). No
-- historical scan or backfill runs during service startup.
CREATE TABLE rating_live_evidence_revisions (
    tenant_id UUID NOT NULL,
    run_id UUID NOT NULL,
    representative_instance_id UUID NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    run_updated_at TIMESTAMPTZ NOT NULL,
    player_observation_count INTEGER NOT NULL DEFAULT 0,
    guild_observation_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, run_id)
);
ALTER TABLE rating_live_evidence_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_live_evidence_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_live_evidence_revisions
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_live_evidence_revisions
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));
COMMIT;
