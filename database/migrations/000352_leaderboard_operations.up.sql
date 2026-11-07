BEGIN;
-- Operational audit only: no source scan, backfill, or populated-table index build.
CREATE TABLE leaderboard_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 requested_by uuid NOT NULL,
 purpose text NOT NULL CHECK (purpose IN ('bootstrap','repair')),
 scope text NOT NULL CHECK (scope IN ('tenant','run')),
 run_id uuid,
 before_date date NOT NULL,
 cutoff timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'discovering' CHECK (state IN ('discovering','draining','paused','completed')),
 phase text NOT NULL DEFAULT 'runs',
 cursor_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
 cursor_realm uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
 cursor_date timestamptz NOT NULL DEFAULT '-infinity',
 cursor_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
 discovered bigint NOT NULL DEFAULT 0,
 missing_dates bigint NOT NULL DEFAULT 0,
 discovery_complete boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 last_progress_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 retry_count integer NOT NULL DEFAULT 0,
 retry_after timestamptz NOT NULL DEFAULT '-infinity',
 last_error text NOT NULL DEFAULT '',
 CHECK ((scope='run')=(run_id IS NOT NULL))
);
CREATE UNIQUE INDEX leaderboard_operations_unfinished ON leaderboard_operations(tenant_id) WHERE state<>'completed';
CREATE INDEX leaderboard_operations_history ON leaderboard_operations(tenant_id,started_at DESC,id);
ALTER TABLE leaderboard_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON leaderboard_operations
 USING (tenant_id=COALESCE(NULLIF(current_setting('app.tenant_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid))
 WITH CHECK (tenant_id=COALESCE(NULLIF(current_setting('app.tenant_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE POLICY tenant_admin_bypass ON leaderboard_operations
 USING (current_setting('app.tenant_bypass',true)='true')
 WITH CHECK (current_setting('app.tenant_bypass',true)='true');
COMMIT;
