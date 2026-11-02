BEGIN;

-- This is a non-serving foundation. Existing group scoring remains untouched
-- until the writer and readers can cut over atomically. No historical rows are
-- rewritten during startup.
-- A zero UUID represents root (untenanted) servers, as in rating_config_revisions.
CREATE TABLE rating_tenant_policies (
    tenant_id UUID PRIMARY KEY,
    version INT NOT NULL CHECK (version > 0),
    half_life_days DOUBLE PRECISION NOT NULL CHECK (half_life_days > 0 AND half_life_days <= 3650),
    best_weight DOUBLE PRECISION NOT NULL CHECK (best_weight >= 0),
    form_weight DOUBLE PRECISION NOT NULL CHECK (form_weight >= 0),
    floor_weight DOUBLE PRECISION NOT NULL CHECK (floor_weight >= 0),
    rank_one_weight DOUBLE PRECISION NOT NULL CHECK (rank_one_weight >= 0 AND rank_one_weight <= 1),
    full_rank_kills INT NOT NULL CHECK (full_rank_kills BETWEEN 1 AND 10000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (abs(best_weight + form_weight + floor_weight - 1) < 0.000000001)
);

-- Only curated Renown has an allowlist. Peak and Mastery must never join this
-- table to determine which parsed encounters are eligible.
CREATE TABLE rating_tenant_renown_bosses (
    tenant_id UUID NOT NULL,
    instance_name TEXT NOT NULL CHECK (length(btrim(instance_name)) > 0),
    encounter_name TEXT NOT NULL CHECK (length(btrim(encounter_name)) > 0),
    renown_points DOUBLE PRECISION NOT NULL CHECK (renown_points >= 0),
    PRIMARY KEY (tenant_id, instance_name, encounter_name)
);

-- RLS is explicit for the zero-UUID root tenant. In particular a root request
-- cannot mutate a named tenant's configuration merely because its server is
-- include_in_all. Administrative background work uses the existing bypass.
ALTER TABLE rating_tenant_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_tenant_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_tenant_policies
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_tenant_policies
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE rating_tenant_renown_bosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_tenant_renown_bosses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_tenant_renown_bosses
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_tenant_renown_bosses
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

-- Fence staged generations on every tenant configuration mutation. An update
-- with unchanged values does not invalidate a rebuild. Keep this independent
-- of the old group-based trigger until the writer is switched over.
CREATE FUNCTION bump_tenant_rating_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    old_tenant UUID;
    new_tenant UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
    IF TG_OP <> 'INSERT' THEN old_tenant := OLD.tenant_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_tenant := NEW.tenant_id; END IF;
    IF old_tenant IS NOT NULL THEN
        INSERT INTO rating_config_revisions (tenant_id, revision) VALUES (old_tenant, 1)
        ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
    END IF;
    IF new_tenant IS NOT NULL AND new_tenant IS DISTINCT FROM old_tenant THEN
        INSERT INTO rating_config_revisions (tenant_id, revision) VALUES (new_tenant, 1)
        ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER rating_tenant_policy_revision AFTER INSERT OR UPDATE OR DELETE ON rating_tenant_policies
    FOR EACH ROW EXECUTE FUNCTION bump_tenant_rating_revision();
CREATE TRIGGER rating_tenant_renown_revision AFTER INSERT OR UPDATE OR DELETE ON rating_tenant_renown_bosses
    FOR EACH ROW EXECUTE FUNCTION bump_tenant_rating_revision();

COMMIT;
