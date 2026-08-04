-- Parse scoring: persist per-instance parse computation results and track
-- computation receipts for the retry/repair scheduler.
--
-- Design choices:
--  • Normal projection tables, not materialized views.
--  • Every upload persists results; reads deduplicate by run_id (duplicate_group_id).
--  • Computation receipt tracks attempts (not boolean) for bounded retry schedule.
--  • Snapshot deletion cascades to results and receipts.
--  • Score is derived from best 3 parse percentiles per instance+encounter in 60d window.

-- parse_score_results: One row per (instance, encounter, player, snapshot, metric).
-- Persisted for every upload; reads use run_id + DISTINCT ON to collapse duplicates.
CREATE TABLE parse_score_results (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    instance_id       UUID NOT NULL,
    run_id            UUID NOT NULL,          -- COALESCE(duplicate_group_id, instance_id)
    snapshot_id       UUID NOT NULL REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
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

-- Character history: look up by player_guid + tenant.
CREATE INDEX idx_psr_player ON parse_score_results
    (tenant_id, player_guid, killed_at DESC NULLS LAST);

-- Cascade path from snapshot deletion.
CREATE INDEX idx_psr_snapshot ON parse_score_results (snapshot_id);

-- Instance lookup.
CREATE INDEX idx_psr_instance ON parse_score_results (instance_id);

-- parse_score_receipts: tracks computation state for each instance.
-- Attempt count encodes retry schedule: 1=immediate, 2=+24h, 3=+48h, 4=+7d, then stop.
CREATE TABLE parse_score_receipts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    instance_id       UUID NOT NULL,
    snapshot_id       UUID REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed', 'no_snapshot', 'failed')),
    attempt           INT NOT NULL DEFAULT 0,
    last_attempt_at   TIMESTAMPTZ,
    next_attempt_at   TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (instance_id)
);

-- Repair dispatcher: find receipts needing retry.
CREATE INDEX idx_psreceipt_retry ON parse_score_receipts
    (status, next_attempt_at)
    WHERE status IN ('pending', 'no_snapshot');

-- Tenant scoping.
CREATE INDEX idx_psreceipt_tenant ON parse_score_receipts (tenant_id);
