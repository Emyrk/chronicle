BEGIN;

-- Durable intent to reconcile a canonical logical run's player/guild observations.
-- The run may no longer exist when processed, so do not reference ranking_runs.
-- No historical rows are scanned or backfilled during startup.
CREATE TABLE rating_dirty_observation_runs (
    tenant_id UUID NOT NULL,
    run_id UUID NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, run_id)
);
CREATE INDEX rating_dirty_observation_runs_queue_idx
    ON rating_dirty_observation_runs (tenant_id, changed_at, run_id);

ALTER TABLE rating_dirty_observation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_dirty_observation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_dirty_observation_runs
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_dirty_observation_runs
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;
