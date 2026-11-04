BEGIN;

-- Renown fact changes are a durable, transactional source of dirty subjects.
-- Both sides of an UPDATE matter: a reparse can change the owner or boss.
-- Facts remain durable for career Renown; this table only coalesces work.
CREATE TABLE rating_dirty_renown_subjects (
    tenant_id UUID NOT NULL,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('player', 'guild')),
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    subject_id TEXT NOT NULL CHECK (subject_id <> ''),
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
);
CREATE INDEX rating_dirty_renown_subjects_queue_idx
    ON rating_dirty_renown_subjects (tenant_id, changed_at, subject_kind, realm_id, subject_id);

ALTER TABLE rating_dirty_renown_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_dirty_renown_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_dirty_renown_subjects
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_dirty_renown_subjects
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));

CREATE FUNCTION mark_rating_renown_fact_dirty() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
CREATE TRIGGER mark_player_renown_dirty
    AFTER INSERT OR UPDATE OR DELETE ON renown_kill_facts
    FOR EACH ROW EXECUTE FUNCTION mark_rating_renown_fact_dirty();
CREATE TRIGGER mark_guild_renown_dirty
    AFTER INSERT OR UPDATE OR DELETE ON guild_renown_kill_facts
    FOR EACH ROW EXECUTE FUNCTION mark_rating_renown_fact_dirty();

COMMIT;
