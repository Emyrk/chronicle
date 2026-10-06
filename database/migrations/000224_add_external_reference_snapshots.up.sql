BEGIN;

CREATE FUNCTION validate_external_reference_tenant_realm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE realm.id = NEW.realm_id
          AND server.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'realm % does not belong to tenant %', NEW.realm_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TABLE external_reference_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('player', 'guild')),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    normalized_name TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    current_snapshot_id UUID,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, realm_id, kind, normalized_name),
    UNIQUE (id, tenant_id, kind),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE TRIGGER external_reference_entities_tenant_realm
    BEFORE INSERT OR UPDATE OF tenant_id, realm_id
    ON external_reference_entities
    FOR EACH ROW EXECUTE FUNCTION validate_external_reference_tenant_realm();

CREATE TABLE external_reference_contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('player', 'guild')),
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, kind, schema_version, content_hash),
    UNIQUE (id, tenant_id, kind)
);

CREATE TABLE external_reference_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('player', 'guild')),
    entity_id UUID NOT NULL,
    content_id UUID NOT NULL,
    observed_on DATE NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    observed_at TIMESTAMPTZ NOT NULL,
    last_observed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (entity_id, tenant_id, kind)
        REFERENCES external_reference_entities(id, tenant_id, kind) ON DELETE CASCADE,
    FOREIGN KEY (content_id, tenant_id, kind)
        REFERENCES external_reference_contents(id, tenant_id, kind) ON DELETE RESTRICT,
    UNIQUE (entity_id, observed_on, sequence),
    UNIQUE (id, entity_id),
    CHECK (last_observed_at >= observed_at)
);

ALTER TABLE external_reference_entities
    ADD CONSTRAINT external_reference_entities_current_snapshot_fkey
    FOREIGN KEY (current_snapshot_id, id)
    REFERENCES external_reference_snapshots(id, entity_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX external_reference_snapshots_entity_time_idx
    ON external_reference_snapshots (entity_id, observed_at DESC, sequence DESC);

ALTER TABLE external_reference_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_reference_entities FORCE ROW LEVEL SECURITY;
ALTER TABLE external_reference_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_reference_contents FORCE ROW LEVEL SECURITY;
ALTER TABLE external_reference_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_reference_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_bypass ON external_reference_entities
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_reference_entity_isolation ON external_reference_entities
    USING (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND realm_id IN (SELECT id FROM wow_server_realms)
    )
    WITH CHECK (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND realm_id IN (SELECT id FROM wow_server_realms)
    );

CREATE POLICY tenant_admin_bypass ON external_reference_contents
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_reference_content_isolation ON external_reference_contents
    USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_admin_bypass ON external_reference_snapshots
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_reference_snapshot_isolation ON external_reference_snapshots
    USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

COMMIT;
