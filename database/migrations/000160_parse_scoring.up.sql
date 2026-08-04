-- Parse scoring: persist per-instance parse computation results and track
-- successful computation receipts.
--
-- Design choices:
--  • Normal projection tables, not materialized views.
--  • Every upload persists results (Option B); reads deduplicate by run_id.
--  • No unique constraints on results — duplicate uploads are collapsed at read time.
--  • Receipt existence means fully-committed success; no pending/failed rows.
--  • Snapshot deletion cascades results AND receipts, so repair rediscovers them.
--  • Score is derived from best 3 parse scores per (instance_name, encounter_name)
--    group, averaged per group, then averaged across groups.

-- parse_score_results: One row per (instance, encounter, player, snapshot, metric).
-- Persisted for every upload; reads use run_id + DISTINCT ON to collapse duplicates.
CREATE TABLE parse_score_results (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    instance_id       UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    run_id            UUID NOT NULL,          -- COALESCE(duplicate_group_id, instance_id)
    snapshot_id       UUID NOT NULL REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
    log_group_id      UUID REFERENCES wow_log_groups(id) ON DELETE SET NULL,
    guild_id          UUID REFERENCES guilds(id) ON DELETE SET NULL,
    encounter_name    TEXT NOT NULL,
    player_guid       TEXT NOT NULL,
    player_name       TEXT NOT NULL DEFAULT '',
    player_class      TEXT NOT NULL DEFAULT '',
    player_spec       TEXT NOT NULL DEFAULT '',
    player_role       TEXT NOT NULL DEFAULT '',
    metric            TEXT NOT NULL CHECK (metric IN ('dps', 'hps')),
    metric_value      DOUBLE PRECISION NOT NULL,
    precise_score     DOUBLE PRECISION NOT NULL,
    display_score     SMALLINT NOT NULL,
    rank              INT NOT NULL,
    sample_size       INT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'ok',
    instance_name     TEXT NOT NULL DEFAULT '',
    difficulty_name   TEXT NOT NULL DEFAULT '',
    max_players       SMALLINT NOT NULL DEFAULT 0,
    killed_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read path: deduplicate by (run_id, encounter, player, snapshot, metric).
CREATE INDEX idx_psr_dedup ON parse_score_results
    (run_id, encounter_name, player_guid, snapshot_id, metric);

-- Character history: look up by player_guid + tenant + metric.
CREATE INDEX idx_psr_player ON parse_score_results
    (tenant_id, player_guid, metric, killed_at DESC NULLS LAST);

-- Cascade path from snapshot deletion.
CREATE INDEX idx_psr_snapshot ON parse_score_results (snapshot_id);

-- Instance lookup (tenant-scoped for deletion during recompute).
CREATE INDEX idx_psr_tenant_instance ON parse_score_results (tenant_id, instance_id);

-- parse_score_receipts: one row per successfully-committed scoring run.
-- Receipt existence = fully committed success. No pending/failed state.
-- Keyed on (instance_id, snapshot_id) so a different snapshot produces a
-- different receipt. Snapshot deletion cascades receipts, making repair
-- rediscover the instance.
CREATE TABLE parse_score_receipts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    instance_id       UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    snapshot_id       UUID NOT NULL REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
    policy_version    SMALLINT NOT NULL DEFAULT 1,
    query_version     SMALLINT NOT NULL DEFAULT 1,
    lookback_days     SMALLINT NOT NULL DEFAULT 60,
    source_count      INT NOT NULL DEFAULT 0,  -- ranking rows processed
    result_count      INT NOT NULL DEFAULT 0,  -- score results written
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, instance_id, snapshot_id, lookback_days, policy_version, query_version)
);

-- Repair dispatcher: find instances with rankings but no matching receipt.
CREATE INDEX idx_psreceipt_instance ON parse_score_receipts (instance_id);
CREATE INDEX idx_psreceipt_snapshot ON parse_score_receipts (snapshot_id);
CREATE INDEX idx_psreceipt_tenant ON parse_score_receipts (tenant_id);
