BEGIN;
-- New bounded snapshot table only; no populated-source rewrite/index build.
CREATE TABLE leaderboard_highlights (
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 instance_name text NOT NULL,
 difficulty_name text NOT NULL,
 max_players smallint NOT NULL,
 realm_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
 configuration_fingerprint text NOT NULL,
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=262144),
 refresh_started_at timestamptz NOT NULL,
 refreshed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,instance_name,difficulty_name,max_players,realm_scope)
);
ALTER TABLE leaderboard_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_highlights FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON leaderboard_highlights
 USING (tenant_id=COALESCE(NULLIF(current_setting('app.tenant_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid))
 WITH CHECK (tenant_id=COALESCE(NULLIF(current_setting('app.tenant_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE POLICY tenant_admin_bypass ON leaderboard_highlights USING(current_setting('app.tenant_bypass',true)='true') WITH CHECK(current_setting('app.tenant_bypass',true)='true');
COMMIT;
