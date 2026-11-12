BEGIN;
-- Small tenant marker only. No existing source/history rows are scanned or rewritten.
CREATE TABLE leaderboard_highlight_sources (
 tenant_id uuid PRIMARY KEY,
 generation bigint NOT NULL DEFAULT 0
);
ALTER TABLE leaderboard_highlight_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_highlight_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON leaderboard_highlight_sources
 USING (tenant_id=COALESCE(NULLIF(current_setting('app.tenant_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid))
 WITH CHECK (tenant_id=COALESCE(NULLIF(current_setting('app.tenant_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE POLICY tenant_admin_bypass ON leaderboard_highlight_sources USING(current_setting('app.tenant_bypass',true)='true') WITH CHECK(current_setting('app.tenant_bypass',true)='true');
ALTER TABLE leaderboard_highlights ADD COLUMN source_generation bigint NOT NULL DEFAULT 0;
COMMIT;
