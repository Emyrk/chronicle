BEGIN;

-- Derived leaderboard data is disposable and rebuilt asynchronously. This
-- migration intentionally creates only empty tables and lightweight dirty-marking
-- triggers; historical data is backfilled outside service startup.
CREATE TABLE ranking_runs (
    run_id UUID PRIMARY KEY,
    representative_instance_id UUID NOT NULL,
    -- NULL identifies legacy/untenanted realms. Tenant-owned rows carry the
    -- owning tenant directly so the fast path does not need the realm/server join.
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    instance_name TEXT NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    realm_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    boss_coverage INTEGER NOT NULL DEFAULT 0,
    encounter_names TEXT[] NOT NULL DEFAULT '{}',
    summary_version SMALLINT NOT NULL,
    source_generation BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ranking_runs_tenant_instance_cohort
    ON ranking_runs
       (tenant_id, instance_name, realm_id, difficulty_name, max_players);
CREATE INDEX idx_ranking_runs_summary_version
    ON ranking_runs (summary_version);

ALTER TABLE ranking_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_bypass ON ranking_runs
    USING (current_setting('app.tenant_bypass', true) = 'true');

-- Preserve the existing RLS chain used by encounter_dps_rankings:
-- summary.realm_id -> wow_server_realms -> wow_servers. The denormalized
-- tenant_id is for explicit fast-query filtering, not authorization.
CREATE POLICY tenant_isolation ON ranking_runs
    USING (realm_id IN (SELECT id FROM wow_server_realms));

-- One row per logical run and player. encounter_name intentionally preserves the
-- slow query's display field: the encounter from the player's highest-damage
-- contribution, not a separate per-encounter summary row.
CREATE TABLE ranking_player_run_summaries (
    run_id UUID NOT NULL REFERENCES ranking_runs(run_id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    player_guid TEXT NOT NULL,
    player_name TEXT NOT NULL,
    player_class TEXT NOT NULL DEFAULT 'Unknown',
    player_spec TEXT NOT NULL DEFAULT 'Unknown',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    player_role TEXT NOT NULL DEFAULT 'dps',
    player_level SMALLINT NOT NULL DEFAULT 0,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    realm_name TEXT NOT NULL,
    guild_name TEXT NOT NULL DEFAULT '',
    damage_done BIGINT NOT NULL,
    healing_done BIGINT NOT NULL DEFAULT 0,
    absorbed_done BIGINT NOT NULL DEFAULT 0,
    duration_secs DOUBLE PRECISION NOT NULL,
    dps DOUBLE PRECISION NOT NULL,
    hps DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_ilvl SMALLINT NOT NULL DEFAULT 0,
    log_hashed_slug TEXT NOT NULL DEFAULT '',
    killed_at TIMESTAMPTZ NOT NULL,
    talent_sub_spec TEXT NOT NULL DEFAULT '',
    talent_layout TEXT NOT NULL DEFAULT '',
    summary_version SMALLINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, player_guid)
);

CREATE INDEX idx_ranking_player_run_summaries_tenant_dps
    ON ranking_player_run_summaries (tenant_id, dps DESC);
CREATE INDEX idx_ranking_player_run_summaries_tenant_hps
    ON ranking_player_run_summaries (tenant_id, hps DESC);
CREATE INDEX idx_ranking_player_run_summaries_tenant_cohort
    ON ranking_player_run_summaries
       (tenant_id, instance_name, realm_id, difficulty_name, max_players,
        player_class, player_spec, player_sub_spec, player_role);
CREATE INDEX idx_ranking_player_run_summaries_killed_at
    ON ranking_player_run_summaries (killed_at);

ALTER TABLE ranking_player_run_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_player_run_summaries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_bypass ON ranking_player_run_summaries
    USING (current_setting('app.tenant_bypass', true) = 'true');

-- Keep authorization on the established realm/server RLS chain. Fast queries
-- may additionally filter tenant_id when the request has a tenant context.
CREATE POLICY tenant_isolation ON ranking_player_run_summaries
    USING (realm_id IN (SELECT id FROM wow_server_realms));

-- This is a database-owned durable work queue. The trigger functions are
-- SECURITY DEFINER so source mutations can always record repair work, including
-- mutations executed under tenant RLS. Workers must still use tenant bypass when
-- reading source rows across tenants.
CREATE TABLE ranking_run_summary_dirty (
    run_id UUID PRIMARY KEY,
    generation BIGINT NOT NULL DEFAULT 1,
    last_transaction_id XID8 NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ranking_run_summary_dirty_updated_at
    ON ranking_run_summary_dirty (updated_at);

CREATE OR REPLACE FUNCTION mark_ranking_run_summary_dirty(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_transaction_id XID8 := pg_current_xact_id();
BEGIN
    IF p_run_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO ranking_run_summary_dirty (
        run_id, generation, last_transaction_id, updated_at
    ) VALUES (
        p_run_id, 1, current_transaction_id, now()
    )
    ON CONFLICT (run_id) DO UPDATE SET
        generation = ranking_run_summary_dirty.generation + 1,
        last_transaction_id = EXCLUDED.last_transaction_id,
        updated_at = EXCLUDED.updated_at
    WHERE ranking_run_summary_dirty.last_transaction_id
          IS DISTINCT FROM EXCLUDED.last_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_instance_ranking_run_summary_dirty(p_instance_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    logical_run_id UUID;
BEGIN
    SELECT COALESCE(duplicate_group_id, id)
    INTO logical_run_id
    FROM log_instances
    WHERE id = p_instance_id;

    PERFORM mark_ranking_run_summary_dirty(logical_run_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_ranking_run_summary_dirty(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_instance_ranking_run_summary_dirty(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION invalidate_ranking_run_from_ranking_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        PERFORM mark_instance_ranking_run_summary_dirty(OLD.instance_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
        PERFORM mark_instance_ranking_run_summary_dirty(NEW.instance_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_invalidate_ranking_run_from_ranking_mutation
AFTER INSERT OR UPDATE OR DELETE ON encounter_dps_rankings
FOR EACH ROW EXECUTE FUNCTION invalidate_ranking_run_from_ranking_mutation();

CREATE OR REPLACE FUNCTION invalidate_ranking_run_from_instance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM mark_ranking_run_summary_dirty(
        COALESCE(OLD.duplicate_group_id, OLD.id)
    );
    PERFORM mark_ranking_run_summary_dirty(
        COALESCE(NEW.duplicate_group_id, NEW.id)
    );
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_invalidate_ranking_run_from_instance_update
AFTER UPDATE OF duplicate_group_id, name, realm_id, start_time ON log_instances
FOR EACH ROW
WHEN (
    OLD.duplicate_group_id IS DISTINCT FROM NEW.duplicate_group_id
    OR OLD.name IS DISTINCT FROM NEW.name
    OR OLD.realm_id IS DISTINCT FROM NEW.realm_id
    OR OLD.start_time IS DISTINCT FROM NEW.start_time
)
EXECUTE FUNCTION invalidate_ranking_run_from_instance_update();

CREATE OR REPLACE FUNCTION invalidate_ranking_runs_from_server_tenant_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    logical_run_id UUID;
BEGIN
    FOR logical_run_id IN
        SELECT DISTINCT COALESCE(li.duplicate_group_id, li.id)
        FROM log_instances li
        JOIN wow_server_realms wsr ON wsr.id = li.realm_id
        WHERE wsr.server_id = NEW.id
    LOOP
        PERFORM mark_ranking_run_summary_dirty(logical_run_id);
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_invalidate_ranking_runs_from_server_tenant_update
AFTER UPDATE OF tenant_id ON wow_servers
FOR EACH ROW
WHEN (OLD.tenant_id IS DISTINCT FROM NEW.tenant_id)
EXECUTE FUNCTION invalidate_ranking_runs_from_server_tenant_update();

CREATE OR REPLACE FUNCTION invalidate_ranking_run_before_instance_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM mark_ranking_run_summary_dirty(
        COALESCE(OLD.duplicate_group_id, OLD.id)
    );
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_invalidate_ranking_run_before_instance_delete
BEFORE DELETE ON log_instances
FOR EACH ROW EXECUTE FUNCTION invalidate_ranking_run_before_instance_delete();

COMMIT;
