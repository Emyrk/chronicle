BEGIN;

-- Unlike generation-local stage rows, these observations survive projection
-- swaps and retain the source run needed to retract superseded evidence.
-- No historical backfill runs at startup.
CREATE TABLE rating_live_player_observations (
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    run_id UUID NOT NULL,
    representative_instance_id UUID NOT NULL,
    player_guid TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL,
    player_spec TEXT NOT NULL,
    player_sub_spec TEXT NOT NULL,
    performance_metric TEXT NOT NULL CHECK (performance_metric IN ('dps', 'hps')),
    killed_at TIMESTAMPTZ NOT NULL,
    raw_value DOUBLE PRECISION NOT NULL CHECK (raw_value > 0),
    duration_secs DOUBLE PRECISION NOT NULL CHECK (duration_secs > 0),
    locked_parse DOUBLE PRECISION,
    PRIMARY KEY (tenant_id, run_id, player_guid, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
);
CREATE INDEX rating_live_player_subject_idx ON rating_live_player_observations
    (tenant_id, realm_id, player_guid, instance_name, encounter_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric, killed_at);
CREATE INDEX rating_live_player_cohort_idx ON rating_live_player_observations
    (tenant_id, instance_name, encounter_name, difficulty_name, max_players,
     player_class, player_spec, player_sub_spec, performance_metric, killed_at);

-- Guildless clean kills still contribute to the tenant-wide Peak denominator.
CREATE TABLE rating_live_guild_observations (
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    run_id UUID NOT NULL,
    representative_instance_id UUID NOT NULL,
    guild_id UUID,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    raw_duration_ms DOUBLE PRECISION NOT NULL CHECK (raw_duration_ms > 0),
    locked_parse DOUBLE PRECISION,
    PRIMARY KEY (tenant_id, run_id, encounter_name)
);
CREATE INDEX rating_live_guild_subject_idx ON rating_live_guild_observations
    (tenant_id, realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players, killed_at);
CREATE INDEX rating_live_guild_cohort_idx ON rating_live_guild_observations
    (tenant_id, instance_name, encounter_name, difficulty_name, max_players, killed_at);

-- A subject key covers both windows. Every source replacement marks both the
-- old and new owner; exact Mastery replay later consumes these keys.
CREATE TABLE rating_dirty_mastery_subjects (
    tenant_id UUID NOT NULL,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('player', 'guild')),
    realm_id UUID NOT NULL,
    subject_id TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL DEFAULT '',
    player_spec TEXT NOT NULL DEFAULT '',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    performance_metric TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
);
CREATE INDEX rating_dirty_mastery_queue_idx ON rating_dirty_mastery_subjects (tenant_id, changed_at);

-- Peak rank-one depends on ALL subjects in a tenant/cohort, including guildless
-- kills. A single dirty key schedules both period and all-time denominators.
CREATE TABLE rating_dirty_peak_cohorts (
    tenant_id UUID NOT NULL,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('player', 'guild')),
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL DEFAULT '',
    player_spec TEXT NOT NULL DEFAULT '',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    performance_metric TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
                 max_players, player_class, player_spec, player_sub_spec, performance_metric)
);
CREATE INDEX rating_dirty_peak_queue_idx ON rating_dirty_peak_cohorts (tenant_id, changed_at);

-- RLS must cover all tenant-scoped durable evidence AND work queues.
DO $$
DECLARE table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'rating_live_player_observations', 'rating_live_guild_observations',
        'rating_dirty_mastery_subjects', 'rating_dirty_peak_cohorts'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('CREATE POLICY tenant_admin_bypass ON %I USING (current_setting(''app.tenant_bypass'', true) = ''true'') WITH CHECK (current_setting(''app.tenant_bypass'', true) = ''true'')', table_name);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = COALESCE(NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid, ''00000000-0000-0000-0000-000000000000''::uuid)) WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid, ''00000000-0000-0000-0000-000000000000''::uuid))', table_name);
    END LOOP;
END;
$$;

CREATE FUNCTION mark_live_player_rating_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE fact rating_live_player_observations%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN fact := OLD; ELSE fact := NEW; END IF;
    INSERT INTO rating_dirty_mastery_subjects
        (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
         difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
    VALUES (fact.tenant_id, 'player', fact.realm_id, fact.player_guid, fact.instance_name,
            fact.encounter_name, fact.difficulty_name, fact.max_players, fact.player_class,
            fact.player_spec, fact.player_sub_spec, fact.performance_metric)
    ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
    DO UPDATE SET revision = rating_dirty_mastery_subjects.revision + 1, changed_at = now();
    INSERT INTO rating_dirty_peak_cohorts
        (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
         max_players, player_class, player_spec, player_sub_spec, performance_metric)
    VALUES (fact.tenant_id, 'player', fact.instance_name, fact.encounter_name, fact.difficulty_name,
            fact.max_players, fact.player_class, fact.player_spec, fact.player_sub_spec, fact.performance_metric)
    ON CONFLICT (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
                 max_players, player_class, player_spec, player_sub_spec, performance_metric)
    DO UPDATE SET revision = rating_dirty_peak_cohorts.revision + 1, changed_at = now();
    RETURN NULL;
END;
$$;
CREATE TRIGGER mark_live_player_rating_dirty_insert AFTER INSERT ON rating_live_player_observations
    FOR EACH ROW EXECUTE FUNCTION mark_live_player_rating_dirty();
CREATE TRIGGER mark_live_player_rating_dirty_delete AFTER DELETE ON rating_live_player_observations
    FOR EACH ROW EXECUTE FUNCTION mark_live_player_rating_dirty();

CREATE FUNCTION mark_live_guild_rating_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE fact rating_live_guild_observations%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN fact := OLD; ELSE fact := NEW; END IF;
    IF fact.guild_id IS NOT NULL THEN
        INSERT INTO rating_dirty_mastery_subjects
            (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
             difficulty_name, max_players, performance_metric)
        VALUES (fact.tenant_id, 'guild', fact.realm_id, fact.guild_id::text, fact.instance_name,
                fact.encounter_name, fact.difficulty_name, fact.max_players, 'none')
        ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name,
                     difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
        DO UPDATE SET revision = rating_dirty_mastery_subjects.revision + 1, changed_at = now();
    END IF;
    INSERT INTO rating_dirty_peak_cohorts
        (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
         max_players, performance_metric)
    VALUES (fact.tenant_id, 'guild', fact.instance_name, fact.encounter_name, fact.difficulty_name,
            fact.max_players, 'none')
    ON CONFLICT (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
                 max_players, player_class, player_spec, player_sub_spec, performance_metric)
    DO UPDATE SET revision = rating_dirty_peak_cohorts.revision + 1, changed_at = now();
    RETURN NULL;
END;
$$;
CREATE TRIGGER mark_live_guild_rating_dirty_insert AFTER INSERT ON rating_live_guild_observations
    FOR EACH ROW EXECUTE FUNCTION mark_live_guild_rating_dirty();
CREATE TRIGGER mark_live_guild_rating_dirty_delete AFTER DELETE ON rating_live_guild_observations
    FOR EACH ROW EXECUTE FUNCTION mark_live_guild_rating_dirty();

COMMIT;
