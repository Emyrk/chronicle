BEGIN;

-- The zero UUID represents root servers (wow_servers.tenant_id IS NULL).
-- Every config edit locks only its tenant's revision row, not the rebuild.
CREATE TABLE rating_config_revisions (
    tenant_id UUID PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

DROP TRIGGER rating_group_rebuild_lock ON rating_realm_groups;
DROP TRIGGER rating_membership_rebuild_lock ON rating_realm_group_memberships;
DROP TRIGGER rating_policy_rebuild_lock ON rating_group_policies;
DROP TRIGGER rating_boss_policy_rebuild_lock ON rating_group_boss_policies;
DROP TRIGGER rating_raid_policy_rebuild_lock ON rating_group_raid_policies;
DROP FUNCTION lock_rating_rebuild_config();

CREATE FUNCTION bump_rating_config_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    old_tenant UUID;
    new_tenant UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'rating_realm_groups' THEN
        IF TG_OP <> 'INSERT' THEN
            SELECT COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
              INTO old_tenant FROM wow_servers WHERE id = OLD.server_id;
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
              INTO new_tenant FROM wow_servers WHERE id = NEW.server_id;
        END IF;
    ELSE
        IF TG_OP <> 'INSERT' THEN
            SELECT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
              INTO old_tenant FROM rating_realm_groups grp
              JOIN wow_servers server ON server.id = grp.server_id
              WHERE grp.id = OLD.group_id;
        END IF;
        IF TG_OP <> 'DELETE' THEN
            SELECT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
              INTO new_tenant FROM rating_realm_groups grp
              JOIN wow_servers server ON server.id = grp.server_id
              WHERE grp.id = NEW.group_id;
        END IF;
    END IF;
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
-- BEFORE DELETE on groups is necessary: cascading deletes may remove children first.
CREATE TRIGGER rating_group_revision BEFORE INSERT OR UPDATE OR DELETE ON rating_realm_groups
    FOR EACH ROW EXECUTE FUNCTION bump_rating_config_revision();
CREATE TRIGGER rating_membership_revision AFTER INSERT OR UPDATE OR DELETE ON rating_realm_group_memberships
    FOR EACH ROW EXECUTE FUNCTION bump_rating_config_revision();
CREATE TRIGGER rating_policy_revision AFTER INSERT OR UPDATE OR DELETE ON rating_group_policies
    FOR EACH ROW EXECUTE FUNCTION bump_rating_config_revision();
CREATE TRIGGER rating_boss_policy_revision AFTER INSERT OR UPDATE OR DELETE ON rating_group_boss_policies
    FOR EACH ROW EXECUTE FUNCTION bump_rating_config_revision();
CREATE TRIGGER rating_raid_policy_revision AFTER INSERT OR UPDATE OR DELETE ON rating_group_raid_policies
    FOR EACH ROW EXECUTE FUNCTION bump_rating_config_revision();

-- One unfinished checkpoint-backed build per tenant. Existing legacy building
-- generations are untouched; only the new small table needs a partial index.
CREATE TABLE rating_rebuild_checkpoints (
    generation_id UUID PRIMARY KEY REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    config_revision BIGINT NOT NULL,
    as_of TIMESTAMPTZ NOT NULL,
    source_cutoff TIMESTAMPTZ NOT NULL,
    phase TEXT NOT NULL DEFAULT 'runs' CHECK (length(btrim(phase)) > 0),
    cursor JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cursor) = 'object'),
    -- Frozen at start: worker must use this manifest, never live config for a resumed build.
    manifest JSONB NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (source_cutoff <= as_of),
    UNIQUE (generation_id, tenant_id)
);
CREATE UNIQUE INDEX rating_rebuild_checkpoints_building_idx
    ON rating_rebuild_checkpoints (tenant_id) WHERE phase NOT IN ('complete', 'aborted');
CREATE INDEX rating_rebuild_checkpoints_tenant_idx ON rating_rebuild_checkpoints (tenant_id, heartbeat_at);

-- Snapshot all config in one short transaction while holding the tenant row.
-- Edits on this tenant serialize on the same row; other tenants continue.
CREATE FUNCTION start_rating_rebuild(p_tenant_id UUID, p_policy_version INT,
                                     p_as_of TIMESTAMPTZ, p_source_cutoff TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    revision_now BIGINT;
    existing_id UUID;
    new_id UUID;
    frozen JSONB;
BEGIN
    IF p_source_cutoff > p_as_of THEN RAISE EXCEPTION 'source cutoff exceeds as_of'; END IF;
    INSERT INTO rating_config_revisions (tenant_id) VALUES (p_tenant_id)
    ON CONFLICT (tenant_id) DO NOTHING;
    SELECT revision INTO revision_now FROM rating_config_revisions
    WHERE tenant_id = p_tenant_id FOR UPDATE;
    SELECT gen.id INTO existing_id FROM rating_rebuild_checkpoints cp
    JOIN rating_score_generations gen ON gen.id = cp.generation_id
    WHERE cp.tenant_id = p_tenant_id AND gen.status = 'building'
      AND cp.phase NOT IN ('complete', 'aborted');
    IF FOUND THEN RETURN existing_id; END IF;
    SELECT jsonb_build_object(
        'groups', (SELECT COALESCE(jsonb_agg(to_jsonb(grp) ORDER BY grp.id), '[]'::jsonb)
                   FROM rating_realm_groups grp JOIN wow_servers server ON server.id = grp.server_id
                   WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_tenant_id),
        'memberships', (SELECT COALESCE(jsonb_agg(to_jsonb(member) ORDER BY member.realm_id), '[]'::jsonb)
                        FROM rating_realm_group_memberships member
                        JOIN rating_realm_groups grp ON grp.id = member.group_id
                        JOIN wow_servers server ON server.id = grp.server_id
                        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_tenant_id),
        'policies', (SELECT COALESCE(jsonb_agg(to_jsonb(policy) ORDER BY policy.group_id), '[]'::jsonb)
                     FROM rating_group_policies policy JOIN rating_realm_groups grp ON grp.id = policy.group_id
                     JOIN wow_servers server ON server.id = grp.server_id
                     WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_tenant_id),
        'boss_policies', (SELECT COALESCE(jsonb_agg(to_jsonb(boss) ORDER BY boss.group_id, boss.instance_name, boss.encounter_name), '[]'::jsonb)
                          FROM rating_group_boss_policies boss JOIN rating_realm_groups grp ON grp.id = boss.group_id
                          JOIN wow_servers server ON server.id = grp.server_id
                          WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_tenant_id),
        'raid_policies', (SELECT COALESCE(jsonb_agg(to_jsonb(raid) ORDER BY raid.group_id, raid.instance_name), '[]'::jsonb)
                          FROM rating_group_raid_policies raid JOIN rating_realm_groups grp ON grp.id = raid.group_id
                          JOIN wow_servers server ON server.id = grp.server_id
                          WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_tenant_id)
    ) INTO frozen;
    INSERT INTO rating_score_generations (tenant_id, policy_version, as_of)
    VALUES (p_tenant_id, p_policy_version, p_as_of) RETURNING id INTO new_id;
    INSERT INTO rating_rebuild_checkpoints (generation_id, tenant_id, config_revision, as_of, source_cutoff, manifest)
    VALUES (new_id, p_tenant_id, revision_now, p_as_of, p_source_cutoff, frozen);
    RETURN new_id;
END;
$$;

-- Protect checkpoint-backed generations even when a caller uses the legacy activation query.
CREATE FUNCTION gate_rating_checkpoint_activation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    checkpoint_revision BIGINT;
    checkpoint_phase TEXT;
    current_revision BIGINT;
BEGIN
    IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
        SELECT config_revision, phase INTO checkpoint_revision, checkpoint_phase FROM rating_rebuild_checkpoints
        WHERE generation_id = NEW.id AND tenant_id = NEW.tenant_id;
        IF FOUND THEN
            SELECT revision INTO current_revision FROM rating_config_revisions
            WHERE tenant_id = NEW.tenant_id FOR UPDATE;
            IF current_revision IS DISTINCT FROM checkpoint_revision OR checkpoint_phase <> 'ready' THEN
                RAISE EXCEPTION 'rating rebuild not ready or configuration changed for tenant %', NEW.tenant_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER rating_checkpoint_activation BEFORE UPDATE OF status ON rating_score_generations
    FOR EACH ROW EXECUTE FUNCTION gate_rating_checkpoint_activation();

-- Caller runs this as a short final transaction. A stale snapshot returns false,
-- retaining the previous active generation and the unmodified checkpoint.
CREATE FUNCTION publish_rating_rebuild(p_generation_id UUID, p_tenant_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
    checkpoint_revision BIGINT;
    current_revision BIGINT;
BEGIN
    SELECT revision INTO current_revision FROM rating_config_revisions
    WHERE tenant_id = p_tenant_id FOR UPDATE;
    SELECT cp.config_revision INTO checkpoint_revision
    FROM rating_rebuild_checkpoints cp
    JOIN rating_score_generations gen ON gen.id = cp.generation_id
    WHERE cp.generation_id = p_generation_id AND cp.tenant_id = p_tenant_id
      AND gen.tenant_id = p_tenant_id AND gen.status = 'building'
      AND cp.phase = 'ready'
    FOR UPDATE OF cp, gen;
    IF NOT FOUND OR current_revision IS DISTINCT FROM checkpoint_revision THEN RETURN false; END IF;
    UPDATE rating_score_generations SET status = 'retired'
    WHERE tenant_id = p_tenant_id AND status = 'active';
    UPDATE rating_score_generations SET status = 'active' WHERE id = p_generation_id;
    UPDATE rating_rebuild_checkpoints SET phase = 'complete', heartbeat_at = now()
    WHERE generation_id = p_generation_id;
    RETURN true;
END;
$$;

COMMIT;
