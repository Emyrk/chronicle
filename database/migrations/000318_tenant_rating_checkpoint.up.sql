BEGIN;

-- Non-serving entry point for the tenant writer. The scheduled group writer
-- continues to use start_rating_rebuild until every tenant projection phase is
-- implemented. Never resume a checkpoint created by the other writer.
CREATE FUNCTION start_tenant_rating_rebuild(p_tenant_id UUID, p_as_of TIMESTAMPTZ,
                                            p_source_cutoff TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    revision_now BIGINT;
    existing_id UUID;
    existing_manifest JSONB;
    new_id UUID;
    frozen JSONB;
    policy_version INT;
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
        RETURN existing_id;
    END IF;

    SELECT version INTO policy_version FROM rating_tenant_policies
    WHERE tenant_id = p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'tenant rating policy missing for tenant %', p_tenant_id; END IF;
    SELECT jsonb_build_object(
        'writer', 'tenant',
        'tenant_policy', (SELECT to_jsonb(policy) FROM rating_tenant_policies policy
                          WHERE policy.tenant_id = p_tenant_id),
        'renown_bosses', (SELECT COALESCE(jsonb_agg(to_jsonb(boss) ORDER BY boss.instance_name, boss.encounter_name), '[]'::jsonb)
                          FROM rating_tenant_renown_bosses boss WHERE boss.tenant_id = p_tenant_id)
    ) INTO frozen;
    INSERT INTO rating_score_generations (tenant_id, policy_version, as_of)
    VALUES (p_tenant_id, policy_version, p_as_of) RETURNING id INTO new_id;
    INSERT INTO rating_rebuild_checkpoints (generation_id, tenant_id, config_revision, as_of, source_cutoff, manifest)
    VALUES (new_id, p_tenant_id, revision_now, p_as_of, p_source_cutoff, frozen);
    RETURN new_id;
END;
$$;

COMMIT;
