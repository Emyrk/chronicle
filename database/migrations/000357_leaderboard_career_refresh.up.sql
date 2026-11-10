BEGIN;
-- Empty materialization and bounded reconciliation tables; no startup backfill.
CREATE TABLE leaderboard_career_identities (
 tenant_id uuid NOT NULL,subject_kind text NOT NULL CHECK(subject_kind IN ('player','guild')),
 realm_id uuid NOT NULL,subject_id text NOT NULL,player_class text NOT NULL DEFAULT '',player_spec text NOT NULL DEFAULT '',player_sub_spec text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec)
);
CREATE TABLE leaderboard_career_subjects (
 LIKE leaderboard_career_identities INCLUDING DEFAULTS INCLUDING CONSTRAINTS,
 chosen_metric text NOT NULL CHECK(chosen_metric IN ('','dps','hps','kill_time')),
 inputs jsonb NOT NULL CHECK(jsonb_typeof(inputs)='object'),
 pool_fingerprint text NOT NULL,
 computed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec)
);
CREATE TABLE leaderboard_dirty_careers (
 tenant_id uuid PRIMARY KEY,revision bigint NOT NULL DEFAULT 1,
 required boolean NOT NULL DEFAULT true,
 dirtied_at timestamptz NOT NULL DEFAULT clock_timestamp(),process_after timestamptz NOT NULL DEFAULT clock_timestamp(),
 claim_token uuid,claimed_revision bigint,locked_until timestamptz,
 retry_after timestamptz NOT NULL DEFAULT '-infinity',attempts integer NOT NULL DEFAULT 0,
 cursor_kind text NOT NULL DEFAULT '',cursor_realm uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
 cursor_subject text NOT NULL DEFAULT '',cursor_class text NOT NULL DEFAULT '',cursor_spec text NOT NULL DEFAULT '',cursor_sub_spec text NOT NULL DEFAULT '',
 pass_revision bigint,
 CHECK(revision > 0),
 CHECK ((claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND locked_until IS NOT NULL))
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['leaderboard_career_identities','leaderboard_career_subjects','leaderboard_dirty_careers'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=COALESCE(NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid,''00000000-0000-0000-0000-000000000000''::uuid)) WITH CHECK (tenant_id=COALESCE(NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid,''00000000-0000-0000-0000-000000000000''::uuid))',tab);
  EXECUTE format('CREATE POLICY tenant_admin_bypass ON %I USING (current_setting(''app.tenant_bypass'',true)=''true'') WITH CHECK (current_setting(''app.tenant_bypass'',true)=''true'')',tab);
 END LOOP;
END $$;
COMMIT;
