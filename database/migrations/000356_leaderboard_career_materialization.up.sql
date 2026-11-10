BEGIN;
-- Empty career-owned tables only. Historical evidence is populated by explicit
-- existing D1 repair/backfill, never a startup source-table scan.
CREATE TABLE leaderboard_career_renown_facts (
 tenant_id uuid NOT NULL,run_id uuid NOT NULL,source_instance_id uuid NOT NULL,
 realm_id uuid NOT NULL,player_guid text NOT NULL,player_class text NOT NULL,
 player_spec text NOT NULL,player_sub_spec text NOT NULL,
 instance_name text NOT NULL,difficulty_name text NOT NULL,max_players smallint NOT NULL,
 encounter_name text NOT NULL,source_encounter_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,run_id,encounter_name,realm_id,player_guid,player_class,player_spec,player_sub_spec)
);
CREATE INDEX leaderboard_career_facts_identity ON leaderboard_career_renown_facts(tenant_id,realm_id,player_guid,player_class,player_spec,player_sub_spec);
CREATE INDEX leaderboard_career_facts_instance ON leaderboard_career_renown_facts(source_instance_id);
CREATE INDEX leaderboard_career_facts_run ON leaderboard_career_renown_facts(run_id);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['leaderboard_career_renown_facts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=COALESCE(NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid,''00000000-0000-0000-0000-000000000000''::uuid)) WITH CHECK (tenant_id=COALESCE(NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid,''00000000-0000-0000-0000-000000000000''::uuid))',tab);
  EXECUTE format('CREATE POLICY tenant_admin_bypass ON %I USING (current_setting(''app.tenant_bypass'',true)=''true'') WITH CHECK (current_setting(''app.tenant_bypass'',true)=''true'')',tab);
 END LOOP;
END $$;
COMMIT;
