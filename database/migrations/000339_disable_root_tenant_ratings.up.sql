BEGIN;

ALTER TABLE site_config
    ADD COLUMN root_tenant_ratings_disabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE FUNCTION tenant_ratings_enabled(p_tenant_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT p_tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid
        OR NOT root_tenant_ratings_disabled
    FROM site_config
    WHERE id = TRUE
$$;

-- Source mutations must not recreate root dirty work while ratings are disabled.
CREATE OR REPLACE FUNCTION mark_rating_renown_fact_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    fact RECORD;
    owner_tenant UUID;
    owner_kind TEXT;
    owner_id TEXT;
    caller_tenant TEXT := current_setting('app.tenant_id', true);
BEGIN
    FOR fact IN SELECT * FROM (
        SELECT CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END AS payload
        UNION ALL
        SELECT CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
    ) sides WHERE payload IS NOT NULL LOOP
        PERFORM set_config('app.tenant_id', COALESCE(caller_tenant, ''), true);
        SELECT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
          INTO STRICT owner_tenant
        FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE realm.id = (fact.payload->>'realm_id')::uuid;
        CONTINUE WHEN NOT tenant_ratings_enabled(owner_tenant);
        owner_kind := CASE WHEN TG_TABLE_NAME = 'renown_kill_facts' THEN 'player' ELSE 'guild' END;
        owner_id := CASE WHEN owner_kind = 'player' THEN fact.payload->>'player_guid'
                         ELSE fact.payload->>'guild_id' END;
        PERFORM set_config('app.tenant_id', owner_tenant::text, true);
        INSERT INTO rating_dirty_renown_subjects
            (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
        VALUES (owner_tenant, owner_kind, (fact.payload->>'realm_id')::uuid,
                owner_id, fact.payload->>'instance_name', fact.payload->>'encounter_name')
        ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
        DO UPDATE SET revision = rating_dirty_renown_subjects.revision + 1,
                      changed_at = now();
    END LOOP;
    PERFORM set_config('app.tenant_id', COALESCE(caller_tenant, ''), true);
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.tenant_id', COALESCE(caller_tenant, ''), true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION mark_live_player_rating_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE fact rating_live_player_observations%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN fact := OLD; ELSE fact := NEW; END IF;
    IF NOT tenant_ratings_enabled(fact.tenant_id) THEN RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION mark_live_guild_rating_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE fact rating_live_guild_observations%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN fact := OLD; ELSE fact := NEW; END IF;
    IF NOT tenant_ratings_enabled(fact.tenant_id) THEN RETURN NULL; END IF;
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

-- Preview before deploy (read-only): replace the table name with each table below.
-- SELECT count(*) FROM rating_live_player_observations
-- WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
-- The largest expected deletes are live/stage player observations and player
-- projection tables. Every delete is explicitly root-scoped and uses indexed
-- tenant/generation keys. Migrations run as the migration owner; the bypass is
-- still set explicitly because these tables use forced tenant RLS.
SET LOCAL app.tenant_bypass = 'true';

DELETE FROM rating_peak_cohort_pages_evolving WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_peak_cohort_pages WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM tenant_rating_copy_progress WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_mastery_accumulators WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_peak_cohort_denominators_evolving WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM player_tenant_rating_boss_scores_evolving WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM player_tenant_rating_scope_scores_evolving WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM guild_tenant_rating_boss_scores_evolving WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM guild_tenant_rating_scope_scores_evolving WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_live_evidence_revisions WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_live_evidence_bootstraps WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_live_player_observations WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_live_guild_observations WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM tenant_rating_read_states WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_policy_scan_progress WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
-- Generation deletion cascades through checkpoints, stage rows, legacy score
-- rows, tenant projections, and generation-bound peak denominators.
DELETE FROM rating_score_generations WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
-- Live-observation deletes fire dirty triggers, so queues are cleared last.
DELETE FROM rating_dirty_observation_runs WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_dirty_renown_subjects WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_dirty_mastery_subjects WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
DELETE FROM rating_dirty_peak_cohorts WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

COMMIT;
