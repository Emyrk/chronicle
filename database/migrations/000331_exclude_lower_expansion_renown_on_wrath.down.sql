BEGIN;

CREATE OR REPLACE FUNCTION apply_rating_renown_template() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    selected_flavors TEXT[];
BEGIN
    SELECT CASE
        WHEN server.id = '10ac9e23-ff74-43ed-83ad-96c123017097'::uuid
            OR 'nightmare-of-ursol' = ANY(dataset.default_flavor)
            THEN ARRAY['vanilla', 'nightmare-of-ursol']::text[]
        WHEN 'vanillaplus' = ANY(dataset.default_flavor)
            THEN ARRAY['vanilla', 'vanillaplus']::text[]
        WHEN 'vanilla' = ANY(dataset.default_flavor) THEN ARRAY['vanilla']::text[]
        ELSE '{}'::text[] END INTO selected_flavors
    FROM rating_realm_groups grp
    JOIN wow_servers server ON server.id = grp.server_id
    LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
    LEFT JOIN datasets dataset ON dataset.id = COALESCE(server.default_dataset_id, tenant.default_dataset_id)
    WHERE grp.id = NEW.group_id;

    IF cardinality(selected_flavors) > 0 THEN
        INSERT INTO rating_group_raid_policies (group_id, instance_name, peak_weight, mastery_weight)
        SELECT NEW.group_id, boss.instance_name, 1, 1
        FROM rating_renown_template_bosses boss
        WHERE boss.flavor = ANY(selected_flavors)
          AND boss.version = (SELECT max(version) FROM rating_renown_templates WHERE flavor = boss.flavor)
          AND NOT (boss.instance_name = 'Molten Core' AND boss.encounter_name = 'Gehennas'
                   AND 'nightmare-of-ursol' = ANY(selected_flavors))
        GROUP BY boss.instance_name
        ON CONFLICT (group_id, instance_name) DO NOTHING;

        INSERT INTO rating_group_boss_policies
            (group_id, instance_name, encounter_name, peak_weight, mastery_weight, renown_points)
        SELECT NEW.group_id, boss.instance_name, boss.encounter_name, 1, 1, boss.renown_points
        FROM rating_renown_template_bosses boss
        WHERE boss.flavor = ANY(selected_flavors)
          AND boss.version = (SELECT max(version) FROM rating_renown_templates WHERE flavor = boss.flavor)
          AND NOT (boss.instance_name = 'Molten Core' AND boss.encounter_name = 'Gehennas'
                   AND 'nightmare-of-ursol' = ANY(selected_flavors))
        ON CONFLICT (group_id, instance_name, encounter_name) DO NOTHING;
        -- Child-row version triggers record edits. Initial defaults are part of
        -- this initial policy, not subsequent administrative revisions.
        UPDATE rating_group_policies SET version = NEW.version WHERE group_id = NEW.group_id;
    END IF;
    RETURN NEW;
END;
$$;

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

COMMIT;
