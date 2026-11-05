BEGIN;

CREATE OR REPLACE FUNCTION mark_rating_renown_fact_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    fact RECORD;
    owner_tenant UUID;
    owner_kind TEXT;
    owner_id TEXT;
BEGIN
    FOR fact IN SELECT * FROM (
        SELECT CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END AS payload
        UNION ALL
        SELECT CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
    ) sides WHERE payload IS NOT NULL LOOP
        SELECT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
          INTO STRICT owner_tenant
        FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE realm.id = (fact.payload->>'realm_id')::uuid;
        owner_kind := CASE WHEN TG_TABLE_NAME = 'renown_kill_facts' THEN 'player' ELSE 'guild' END;
        owner_id := CASE WHEN owner_kind = 'player' THEN fact.payload->>'player_guid'
                         ELSE fact.payload->>'guild_id' END;
        INSERT INTO rating_dirty_renown_subjects
            (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
        VALUES (owner_tenant, owner_kind, (fact.payload->>'realm_id')::uuid,
                owner_id, fact.payload->>'instance_name', fact.payload->>'encounter_name')
        ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
        DO UPDATE SET revision = rating_dirty_renown_subjects.revision + 1,
                      changed_at = now();
    END LOOP;
    RETURN NULL;
END;
$$;

COMMIT;
