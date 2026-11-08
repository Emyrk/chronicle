BEGIN;

-- All-time Data -> Evidence -> Summary schema only. No workers, backfill,
-- validation triggers, or automatic invalidation. No source FKs (CASCADE or
-- RESTRICT): source identifiers and pending repairs must survive source deletion.
-- Application transactions enforce canonical source ownership and consistency.
-- tenant_id plus forced RLS isolates access, not correctness of source ownership.
-- projection_version / algorithm_version describe raw-data compatibility only;
-- they are NOT a frozen flavor configuration revision or Renown award version.

-- Data -> Evidence. Source IDs deliberately have NO FKs: repair must still read old evidence after source deletion. Application reconciliation owns canonical/tenant/source agreement.
CREATE TABLE leaderboard_player_observations (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    run_id uuid NOT NULL,
    source_instance_id uuid NOT NULL,
    realm_id uuid NOT NULL,
    player_guid text NOT NULL CHECK (btrim(player_guid) <> ''),
    source_encounter_id uuid NOT NULL,
    source_ranking_id uuid NOT NULL,
    player_class text NOT NULL CHECK (btrim(player_class) <> ''),
    player_spec text NOT NULL CHECK (btrim(player_spec) <> ''),
    player_sub_spec text NOT NULL,
    metric text NOT NULL CHECK (metric IN ('dps', 'hps')),
    metric_value double precision NOT NULL CHECK (metric_value >= 0 AND metric_value < 'Infinity'::double precision),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    observed_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, realm_id, player_guid, metric)
);
CREATE INDEX leaderboard_player_observations_run_idx ON leaderboard_player_observations (tenant_id, run_id);
CREATE INDEX leaderboard_player_observations_scope_idx ON leaderboard_player_observations (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid);
ALTER TABLE leaderboard_player_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_player_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_player_observations
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_player_observations
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Data -> Evidence. Source IDs deliberately have NO FKs: repair must still read old evidence after source deletion. Application reconciliation owns canonical/tenant/source agreement.
CREATE TABLE leaderboard_guild_boss_observations (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    run_id uuid NOT NULL,
    source_instance_id uuid NOT NULL,
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    source_time_parse_score_id uuid NOT NULL,
    source_encounter_id uuid NOT NULL,
    duration_ms bigint NOT NULL CHECK (duration_ms > 0),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    observed_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, realm_id, guild_id)
);
CREATE INDEX leaderboard_guild_boss_observations_run_idx ON leaderboard_guild_boss_observations (tenant_id, run_id);
CREATE INDEX leaderboard_guild_boss_observations_scope_idx ON leaderboard_guild_boss_observations (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id);
ALTER TABLE leaderboard_guild_boss_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_boss_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_boss_observations
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_boss_observations
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Data -> Evidence. Source IDs deliberately have NO FKs: repair must still read old evidence after source deletion. Application reconciliation owns canonical/tenant/source agreement.
CREATE TABLE leaderboard_guild_clear_observations (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    run_id uuid NOT NULL,
    source_instance_id uuid NOT NULL,
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    source_time_parse_score_id uuid NOT NULL,
    duration_ms bigint NOT NULL CHECK (duration_ms > 0),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    observed_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, run_id, realm_id, guild_id)
);
CREATE INDEX leaderboard_guild_clear_observations_run_idx ON leaderboard_guild_clear_observations (tenant_id, run_id);
CREATE INDEX leaderboard_guild_clear_observations_scope_idx ON leaderboard_guild_clear_observations (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id);
ALTER TABLE leaderboard_guild_clear_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_clear_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_clear_observations
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_clear_observations
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Data -> Evidence. Source IDs deliberately have NO FKs: repair must still read old evidence after source deletion. Application reconciliation owns canonical/tenant/source agreement.
CREATE TABLE leaderboard_player_renown_facts (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    run_id uuid NOT NULL,
    source_instance_id uuid NOT NULL,
    realm_id uuid NOT NULL,
    player_guid text NOT NULL CHECK (btrim(player_guid) <> ''),
    source_encounter_id uuid NOT NULL,
    projection_version integer NOT NULL CHECK (projection_version > 0),
    observed_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, realm_id, player_guid)
);
CREATE INDEX leaderboard_player_renown_facts_run_idx ON leaderboard_player_renown_facts (tenant_id, run_id);
CREATE INDEX leaderboard_player_renown_facts_scope_idx ON leaderboard_player_renown_facts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid);
ALTER TABLE leaderboard_player_renown_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_player_renown_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_player_renown_facts
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_player_renown_facts
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Data -> Evidence. Source IDs deliberately have NO FKs: repair must still read old evidence after source deletion. Application reconciliation owns canonical/tenant/source agreement.
CREATE TABLE leaderboard_guild_renown_facts (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    run_id uuid NOT NULL,
    source_instance_id uuid NOT NULL,
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    source_encounter_id uuid NOT NULL,
    projection_version integer NOT NULL CHECK (projection_version > 0),
    observed_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, realm_id, guild_id)
);
CREATE INDEX leaderboard_guild_renown_facts_run_idx ON leaderboard_guild_renown_facts (tenant_id, run_id);
CREATE INDEX leaderboard_guild_renown_facts_scope_idx ON leaderboard_guild_renown_facts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id);
ALTER TABLE leaderboard_guild_renown_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_renown_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_renown_facts
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_renown_facts
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- All-time tenant cohort. Realm is NOT a benchmark partition. Current benchmark is applied to raw subject statistics at read time.
CREATE TABLE leaderboard_player_boss_benchmarks (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    player_class text NOT NULL CHECK (btrim(player_class) <> ''),
    player_spec text NOT NULL CHECK (btrim(player_spec) <> ''),
    player_sub_spec text NOT NULL,
    metric text NOT NULL CHECK (metric IN ('dps', 'hps')),
    best_metric double precision NOT NULL CHECK (best_metric >= 0 AND best_metric < 'Infinity'::double precision),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric)
);
ALTER TABLE leaderboard_player_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_player_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_player_boss_benchmarks
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_player_boss_benchmarks
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Raw sufficient statistics only, never normalized Mastery. Empty bands store zero; remove the row when no observations remain.
CREATE TABLE leaderboard_player_boss_subjects (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    player_class text NOT NULL CHECK (btrim(player_class) <> ''),
    player_spec text NOT NULL CHECK (btrim(player_spec) <> ''),
    player_sub_spec text NOT NULL,
    metric text NOT NULL CHECK (metric IN ('dps', 'hps')),
    realm_id uuid NOT NULL,
    player_guid text NOT NULL CHECK (btrim(player_guid) <> ''),
    observation_count bigint NOT NULL CHECK (observation_count > 0),
    raw_peak double precision NOT NULL CHECK (raw_peak >= 0 AND raw_peak < 'Infinity'::double precision),
    raw_form double precision NOT NULL CHECK (raw_form >= 0 AND raw_form < 'Infinity'::double precision),
    raw_floor double precision NOT NULL CHECK (raw_floor >= 0 AND raw_floor < 'Infinity'::double precision),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid)
);
ALTER TABLE leaderboard_player_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_player_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_player_boss_subjects
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_player_boss_subjects
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- All-time tenant cohort. Realm is NOT a benchmark partition. Current benchmark is applied to raw subject statistics at read time.
CREATE TABLE leaderboard_guild_boss_benchmarks (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    best_duration_ms bigint NOT NULL CHECK (best_duration_ms > 0),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name)
);
ALTER TABLE leaderboard_guild_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_boss_benchmarks
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_boss_benchmarks
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Raw sufficient statistics only, never normalized Mastery. Empty bands store zero; remove the row when no observations remain. Guild bands average reciprocal durations (1/ms), NOT durations, to preserve the Mastery equation.
CREATE TABLE leaderboard_guild_boss_subjects (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    observation_count bigint NOT NULL CHECK (observation_count > 0),
    fastest_duration_ms bigint NOT NULL CHECK (fastest_duration_ms > 0),
    form_mean_inverse_ms double precision NOT NULL CHECK (form_mean_inverse_ms >= 0 AND form_mean_inverse_ms < 'Infinity'::double precision),
    floor_mean_inverse_ms double precision NOT NULL CHECK (floor_mean_inverse_ms >= 0 AND floor_mean_inverse_ms < 'Infinity'::double precision),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id)
);
ALTER TABLE leaderboard_guild_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_boss_subjects
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_boss_subjects
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- All-time tenant cohort. Realm is NOT a benchmark partition. Current benchmark is applied to raw subject statistics at read time.
CREATE TABLE leaderboard_guild_clear_benchmarks (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    best_duration_ms bigint NOT NULL CHECK (best_duration_ms > 0),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players)
);
ALTER TABLE leaderboard_guild_clear_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_clear_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_clear_benchmarks
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_clear_benchmarks
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Raw sufficient statistics only, never normalized Mastery. Empty bands store zero; remove the row when no observations remain. Guild bands average reciprocal durations (1/ms), NOT durations, to preserve the Mastery equation.
CREATE TABLE leaderboard_guild_clear_subjects (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    observation_count bigint NOT NULL CHECK (observation_count > 0),
    fastest_duration_ms bigint NOT NULL CHECK (fastest_duration_ms > 0),
    form_mean_inverse_ms double precision NOT NULL CHECK (form_mean_inverse_ms >= 0 AND form_mean_inverse_ms < 'Infinity'::double precision),
    floor_mean_inverse_ms double precision NOT NULL CHECK (floor_mean_inverse_ms >= 0 AND floor_mean_inverse_ms < 'Infinity'::double precision),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id)
);
ALTER TABLE leaderboard_guild_clear_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_clear_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_clear_subjects
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_clear_subjects
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Metric-independent eligible kill count. Current composed awards are applied at reads, never frozen as points. Remove empty counts.
CREATE TABLE leaderboard_player_renown_counts (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    realm_id uuid NOT NULL,
    player_guid text NOT NULL CHECK (btrim(player_guid) <> ''),
    kill_count bigint NOT NULL CHECK (kill_count > 0),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid)
);
ALTER TABLE leaderboard_player_renown_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_player_renown_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_player_renown_counts
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_player_renown_counts
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Metric-independent eligible kill count. Current composed awards are applied at reads, never frozen as points. Remove empty counts.
CREATE TABLE leaderboard_guild_renown_counts (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    kill_count bigint NOT NULL CHECK (kill_count > 0),
    projection_version integer NOT NULL CHECK (projection_version > 0),
    algorithm_version integer NOT NULL CHECK (algorithm_version > 0),
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id)
);
ALTER TABLE leaderboard_guild_renown_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_guild_renown_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_guild_renown_counts
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_guild_renown_counts
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D1: rare Data -> Evidence repair. Source deletion must enqueue before deleting data. Old evidence survives until repair diffs old/new and enqueues the union of D2 scopes atomically. Normal ingestion may write Evidence + D2 directly. No mandatory debounce.
CREATE TABLE leaderboard_dirty_runs (
    tenant_id uuid NOT NULL,
    run_id uuid NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, run_id)
);
CREATE INDEX leaderboard_dirty_runs_due_idx ON leaderboard_dirty_runs (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_runs
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_runs
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced Evidence -> Summary work. Increment revision on every enqueue; acknowledge only the claimed revision. Benchmark-only changes do not dirty raw subject statistics.
CREATE TABLE leaderboard_dirty_player_boss_benchmarks (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    player_class text NOT NULL CHECK (btrim(player_class) <> ''),
    player_spec text NOT NULL CHECK (btrim(player_spec) <> ''),
    player_sub_spec text NOT NULL,
    metric text NOT NULL CHECK (metric IN ('dps', 'hps')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric)
);
CREATE INDEX leaderboard_dirty_player_boss_benchmarks_due_idx ON leaderboard_dirty_player_boss_benchmarks (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_player_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_player_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_player_boss_benchmarks
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_player_boss_benchmarks
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced Evidence -> Summary work. Increment revision on every enqueue; acknowledge only the claimed revision. Benchmark-only changes do not dirty raw subject statistics.
CREATE TABLE leaderboard_dirty_player_boss_subjects (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    player_class text NOT NULL CHECK (btrim(player_class) <> ''),
    player_spec text NOT NULL CHECK (btrim(player_spec) <> ''),
    player_sub_spec text NOT NULL,
    metric text NOT NULL CHECK (metric IN ('dps', 'hps')),
    realm_id uuid NOT NULL,
    player_guid text NOT NULL CHECK (btrim(player_guid) <> ''),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid)
);
CREATE INDEX leaderboard_dirty_player_boss_subjects_due_idx ON leaderboard_dirty_player_boss_subjects (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_player_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_player_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_player_boss_subjects
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_player_boss_subjects
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced Evidence -> Summary work. Increment revision on every enqueue; acknowledge only the claimed revision. Benchmark-only changes do not dirty raw subject statistics.
CREATE TABLE leaderboard_dirty_guild_boss_benchmarks (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name)
);
CREATE INDEX leaderboard_dirty_guild_boss_benchmarks_due_idx ON leaderboard_dirty_guild_boss_benchmarks (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_guild_boss_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_guild_boss_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_guild_boss_benchmarks
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_guild_boss_benchmarks
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced Evidence -> Summary work. Increment revision on every enqueue; acknowledge only the claimed revision. Benchmark-only changes do not dirty raw subject statistics.
CREATE TABLE leaderboard_dirty_guild_boss_subjects (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id)
);
CREATE INDEX leaderboard_dirty_guild_boss_subjects_due_idx ON leaderboard_dirty_guild_boss_subjects (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_guild_boss_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_guild_boss_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_guild_boss_subjects
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_guild_boss_subjects
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced Evidence -> Summary work. Increment revision on every enqueue; acknowledge only the claimed revision. Benchmark-only changes do not dirty raw subject statistics.
CREATE TABLE leaderboard_dirty_guild_clear_benchmarks (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players)
);
CREATE INDEX leaderboard_dirty_guild_clear_benchmarks_due_idx ON leaderboard_dirty_guild_clear_benchmarks (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_guild_clear_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_guild_clear_benchmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_guild_clear_benchmarks
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_guild_clear_benchmarks
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced Evidence -> Summary work. Increment revision on every enqueue; acknowledge only the claimed revision. Benchmark-only changes do not dirty raw subject statistics.
CREATE TABLE leaderboard_dirty_guild_clear_subjects (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id)
);
CREATE INDEX leaderboard_dirty_guild_clear_subjects_due_idx ON leaderboard_dirty_guild_clear_subjects (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_guild_clear_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_guild_clear_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_guild_clear_subjects
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_guild_clear_subjects
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced exact boss/variant count scope, independent of metric and award policy. Acknowledge only the claimed revision.
CREATE TABLE leaderboard_dirty_player_renown (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    realm_id uuid NOT NULL,
    player_guid text NOT NULL CHECK (btrim(player_guid) <> ''),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid)
);
CREATE INDEX leaderboard_dirty_player_renown_due_idx ON leaderboard_dirty_player_renown (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_player_renown ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_player_renown FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_player_renown
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_player_renown
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- D2: coalesced exact boss/variant count scope, independent of metric and award policy. Acknowledge only the claimed revision.
CREATE TABLE leaderboard_dirty_guild_renown (
    tenant_id uuid NOT NULL,
    instance_name text NOT NULL CHECK (btrim(instance_name) <> ''),
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    realm_id uuid NOT NULL,
    guild_id uuid NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    dirtied_at timestamptz NOT NULL DEFAULT now(),
    process_after timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id)
);
CREATE INDEX leaderboard_dirty_guild_renown_due_idx ON leaderboard_dirty_guild_renown (process_after, tenant_id);
ALTER TABLE leaderboard_dirty_guild_renown ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_dirty_guild_renown FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON leaderboard_dirty_guild_renown
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON leaderboard_dirty_guild_renown
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;
