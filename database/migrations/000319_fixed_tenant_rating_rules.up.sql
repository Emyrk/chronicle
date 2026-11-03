BEGIN;

-- These are product rules, shared by every tenant. Keep the generation's
-- version and full rules in its manifest so a resumed worker cannot change
-- calibration midway through a rebuild. The 180-day window is unchanged.
CREATE OR REPLACE FUNCTION start_tenant_rating_rebuild(p_tenant_id UUID, p_as_of TIMESTAMPTZ,
                                                       p_source_cutoff TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    revision_now BIGINT;
    existing_id UUID;
    existing_manifest JSONB;
    new_id UUID;
    frozen JSONB;
BEGIN
    IF p_source_cutoff > p_as_of THEN RAISE EXCEPTION 'source cutoff exceeds as_of'; END IF;
    INSERT INTO rating_config_revisions (tenant_id) VALUES (p_tenant_id)
    ON CONFLICT (tenant_id) DO NOTHING;
    SELECT revision INTO revision_now FROM rating_config_revisions
    WHERE tenant_id = p_tenant_id FOR UPDATE;

    SELECT gen.id, cp.manifest INTO existing_id, existing_manifest
    FROM rating_rebuild_checkpoints cp
    JOIN rating_score_generations gen ON gen.id = cp.generation_id
    WHERE cp.tenant_id = p_tenant_id AND gen.status = 'building'
      AND cp.phase NOT IN ('complete', 'aborted');
    IF FOUND THEN
        IF existing_manifest->>'writer' IS DISTINCT FROM 'tenant' THEN
            RAISE EXCEPTION 'cannot resume group rating checkpoint as tenant writer';
        END IF;
        IF existing_manifest->>'rules_version' = '2' THEN RETURN existing_id; END IF;
        -- Older checkpoints use mutable tenant policy / time-decayed Mastery.
        -- Retire them at the next rebuild, not in a startup-wide backfill.
        UPDATE rating_rebuild_checkpoints SET phase = 'aborted', heartbeat_at = now()
        WHERE generation_id = existing_id;
        UPDATE rating_score_generations SET status = 'retired' WHERE id = existing_id;
    END IF;

    -- A tenant may own realms on differently flavored servers. Freeze awards
    -- per realm, never a tenant-wide union which would award cross-flavor kills.
    WITH realm_flavors AS (
        SELECT realm.id AS realm_id,
            CASE WHEN server.id = '10ac9e23-ff74-43ed-83ad-96c123017097'::uuid
                      OR 'nightmare-of-ursol' = ANY(dataset.default_flavor)
                    THEN ARRAY['vanilla', 'nightmare-of-ursol']::text[]
                 WHEN 'vanillaplus' = ANY(dataset.default_flavor)
                    THEN ARRAY['vanilla', 'vanillaplus']::text[]
                 WHEN 'vanilla' = ANY(dataset.default_flavor) THEN ARRAY['vanilla']::text[]
                 ELSE '{}'::text[] END AS flavors
        FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
        LEFT JOIN datasets dataset ON dataset.id = COALESCE(server.default_dataset_id, tenant.default_dataset_id)
        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_tenant_id
    ), awards AS (
        SELECT rf.realm_id, boss.instance_name, boss.encounter_name, boss.renown_points
        FROM realm_flavors rf
        JOIN rating_renown_template_bosses boss ON boss.flavor = ANY(rf.flavors)
        WHERE boss.version = (SELECT max(version) FROM rating_renown_templates WHERE flavor = boss.flavor)
          AND NOT (boss.instance_name = 'Molten Core' AND boss.encounter_name = 'Gehennas'
                   AND 'nightmare-of-ursol' = ANY(rf.flavors))
    )
    SELECT jsonb_build_object(
        'writer', 'tenant', 'rules_version', 2,
        'tenant_policy', jsonb_build_object(
            'tenant_id', p_tenant_id, 'version', 2, 'period_days', 180,
            'best_weight', 0.35, 'form_weight', 0.50, 'floor_weight', 0.15,
            'rank_one_weight', 0.50, 'full_rank_kills', 5),
        'renown_bosses', COALESCE(jsonb_agg(jsonb_build_object(
            'realm_id', realm_id, 'instance_name', instance_name,
            'encounter_name', encounter_name, 'renown_points', renown_points)
            ORDER BY realm_id, instance_name, encounter_name), '[]'::jsonb)
    ) INTO frozen FROM awards;
    INSERT INTO rating_score_generations (tenant_id, policy_version, as_of)
    VALUES (p_tenant_id, 2, p_as_of) RETURNING id INTO new_id;
    INSERT INTO rating_rebuild_checkpoints (generation_id, tenant_id, config_revision, as_of, source_cutoff, manifest)
    VALUES (new_id, p_tenant_id, revision_now, p_as_of, p_source_cutoff, frozen);
    RETURN new_id;
END;
$$;

-- Flavor, realm ownership and template changes invalidate a building snapshot.
-- Existing group-policy revision triggers remain in place for the legacy writer.
CREATE FUNCTION bump_fixed_rating_flavor_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'wow_server_realms' THEN
        INSERT INTO rating_config_revisions (tenant_id, revision)
        SELECT DISTINCT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 1
        FROM wow_servers server
        WHERE server.id = ANY(ARRAY[
            CASE WHEN TG_OP <> 'INSERT' THEN OLD.server_id END,
            CASE WHEN TG_OP <> 'DELETE' THEN NEW.server_id END]::uuid[])
        ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
    ELSIF TG_TABLE_NAME = 'wow_servers' THEN
        IF TG_OP <> 'INSERT' THEN
            INSERT INTO rating_config_revisions (tenant_id, revision)
            VALUES (COALESCE(OLD.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 1)
            ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
        END IF;
        IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
            INSERT INTO rating_config_revisions (tenant_id, revision)
            VALUES (COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 1)
            ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
        END IF;
    ELSIF TG_TABLE_NAME = 'tenants' THEN
        INSERT INTO rating_config_revisions (tenant_id, revision)
        VALUES (NEW.id, 1)
        ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
    ELSIF TG_TABLE_NAME = 'datasets' THEN
        INSERT INTO rating_config_revisions (tenant_id, revision)
        SELECT DISTINCT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 1
        FROM wow_servers server
        LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
        WHERE COALESCE(server.default_dataset_id, tenant.default_dataset_id) = NEW.id
        ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
    ELSIF TG_TABLE_NAME = 'rating_renown_templates' OR TG_TABLE_NAME = 'rating_renown_template_bosses' THEN
        INSERT INTO rating_config_revisions (tenant_id, revision)
        SELECT DISTINCT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 1
        FROM wow_servers server JOIN wow_server_realms realm ON realm.server_id = server.id
        ON CONFLICT (tenant_id) DO UPDATE SET revision = rating_config_revisions.revision + 1;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER fixed_rating_realm_revision AFTER INSERT OR UPDATE OF server_id OR DELETE ON wow_server_realms
    FOR EACH ROW EXECUTE FUNCTION bump_fixed_rating_flavor_revision();
CREATE TRIGGER fixed_rating_server_revision AFTER INSERT OR UPDATE OF tenant_id, default_dataset_id OR DELETE ON wow_servers
    FOR EACH ROW EXECUTE FUNCTION bump_fixed_rating_flavor_revision();
CREATE TRIGGER fixed_rating_tenant_revision AFTER UPDATE OF default_dataset_id ON tenants
    FOR EACH ROW EXECUTE FUNCTION bump_fixed_rating_flavor_revision();
CREATE TRIGGER fixed_rating_dataset_revision AFTER UPDATE OF default_flavor ON datasets
    FOR EACH ROW EXECUTE FUNCTION bump_fixed_rating_flavor_revision();
CREATE TRIGGER fixed_rating_template_revision AFTER INSERT OR UPDATE OR DELETE ON rating_renown_templates
    FOR EACH ROW EXECUTE FUNCTION bump_fixed_rating_flavor_revision();
CREATE TRIGGER fixed_rating_template_boss_revision AFTER INSERT OR UPDATE OR DELETE ON rating_renown_template_bosses
    FOR EACH ROW EXECUTE FUNCTION bump_fixed_rating_flavor_revision();

DROP TRIGGER rating_tenant_policy_revision ON rating_tenant_policies;
DROP TRIGGER rating_tenant_renown_revision ON rating_tenant_renown_bosses;
DROP FUNCTION bump_tenant_rating_revision();
DROP TABLE rating_tenant_renown_bosses;
DROP TABLE rating_tenant_policies;

COMMIT;
