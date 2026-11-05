BEGIN;

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

DROP FUNCTION tenant_ratings_enabled(UUID);
ALTER TABLE site_config DROP COLUMN root_tenant_ratings_disabled;

-- Deleted derived root rating state is intentionally not restored. It can be
-- rebuilt after rollback because canonical combat, ranking, and renown facts remain.
COMMIT;
