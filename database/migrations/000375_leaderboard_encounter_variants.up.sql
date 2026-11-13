BEGIN;
-- New, empty exact-variant cohorts only. No existing indexes, data scans, or backfill.
-- Combined and career tables remain untouched. LIKE copies current checks/defaults, not indexes or policies.
CREATE TABLE leaderboard_variant_player_observations (LIKE leaderboard_player_observations INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, run_id, realm_id, player_guid, metric));
ALTER TABLE leaderboard_variant_player_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_player_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_player_observations USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_player_observations USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_guild_boss_observations (LIKE leaderboard_guild_boss_observations INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, run_id, realm_id, guild_id));
ALTER TABLE leaderboard_variant_guild_boss_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_guild_boss_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_guild_boss_observations USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_guild_boss_observations USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_player_boss_benchmarks (LIKE leaderboard_player_boss_benchmarks INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric));
ALTER TABLE leaderboard_variant_player_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_player_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_player_boss_benchmarks USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_player_boss_benchmarks USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_player_boss_subjects (LIKE leaderboard_player_boss_subjects INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid));
ALTER TABLE leaderboard_variant_player_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_player_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_player_boss_subjects USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_player_boss_subjects USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_guild_boss_benchmarks (LIKE leaderboard_guild_boss_benchmarks INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant));
ALTER TABLE leaderboard_variant_guild_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_guild_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_guild_boss_benchmarks USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_guild_boss_benchmarks USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_guild_boss_subjects (LIKE leaderboard_guild_boss_subjects INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, realm_id, guild_id));
ALTER TABLE leaderboard_variant_guild_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_guild_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_guild_boss_subjects USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_guild_boss_subjects USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_dirty_player_boss_benchmarks (LIKE leaderboard_dirty_player_boss_benchmarks INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric));
ALTER TABLE leaderboard_variant_dirty_player_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_dirty_player_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_dirty_player_boss_benchmarks USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_dirty_player_boss_benchmarks USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_dirty_player_boss_subjects (LIKE leaderboard_dirty_player_boss_subjects INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid));
ALTER TABLE leaderboard_variant_dirty_player_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_dirty_player_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_dirty_player_boss_subjects USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_dirty_player_boss_subjects USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_dirty_guild_boss_benchmarks (LIKE leaderboard_dirty_guild_boss_benchmarks INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant));
ALTER TABLE leaderboard_variant_dirty_guild_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_dirty_guild_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_dirty_guild_boss_benchmarks USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_dirty_guild_boss_benchmarks USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE leaderboard_variant_dirty_guild_boss_subjects (LIKE leaderboard_dirty_guild_boss_subjects INCLUDING DEFAULTS INCLUDING CONSTRAINTS, encounter_variant text NOT NULL CHECK (encounter_variant IN ('normal', 'hard')), PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, realm_id, guild_id));
ALTER TABLE leaderboard_variant_dirty_guild_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_variant_dirty_guild_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_variant_dirty_guild_boss_subjects USING (current_setting('app.tenant_bypass', true) = 'true') WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_variant_dirty_guild_boss_subjects USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Index parity with Combined, built only on these new empty tables.
CREATE INDEX leaderboard_variant_dirty_guild_boss_benchmarks_due_idx ON leaderboard_variant_dirty_guild_boss_benchmarks USING btree (process_after, tenant_id);
CREATE INDEX leaderboard_variant_dirty_guild_boss_subjects_due_idx ON leaderboard_variant_dirty_guild_boss_subjects USING btree (process_after, tenant_id);
CREATE INDEX leaderboard_variant_dirty_player_boss_benchmarks_due_idx ON leaderboard_variant_dirty_player_boss_benchmarks USING btree (process_after, tenant_id);
CREATE INDEX leaderboard_variant_dirty_player_boss_subjects_due_idx ON leaderboard_variant_dirty_player_boss_subjects USING btree (process_after, tenant_id);
CREATE INDEX leaderboard_variant_guild_boss_observations_best_idx ON leaderboard_variant_guild_boss_observations USING btree (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, duration_ms);
CREATE INDEX leaderboard_variant_guild_boss_observations_run_idx ON leaderboard_variant_guild_boss_observations USING btree (tenant_id, run_id);
CREATE INDEX leaderboard_variant_guild_boss_observations_run_lookup_idx ON leaderboard_variant_guild_boss_observations USING btree (run_id);
CREATE INDEX leaderboard_variant_guild_boss_observations_scope_idx ON leaderboard_variant_guild_boss_observations USING btree (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, realm_id, guild_id);
CREATE INDEX leaderboard_variant_guild_boss_observations_source_lookup_idx ON leaderboard_variant_guild_boss_observations USING btree (source_instance_id);
CREATE INDEX leaderboard_variant_player_boss_read_idx ON leaderboard_variant_player_boss_subjects USING btree (tenant_id, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid, encounter_name, encounter_variant) INCLUDE (raw_peak, raw_form, raw_floor, observation_count, computed_at);
CREATE INDEX leaderboard_variant_player_observations_best_idx ON leaderboard_variant_player_observations USING btree (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, metric_value DESC);
CREATE INDEX leaderboard_variant_player_observations_run_idx ON leaderboard_variant_player_observations USING btree (tenant_id, run_id);
CREATE INDEX leaderboard_variant_player_observations_run_lookup_idx ON leaderboard_variant_player_observations USING btree (run_id);
CREATE INDEX leaderboard_variant_player_observations_scope_idx ON leaderboard_variant_player_observations USING btree (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid);
CREATE INDEX leaderboard_variant_player_observations_source_lookup_idx ON leaderboard_variant_player_observations USING btree (source_instance_id);

COMMIT;
