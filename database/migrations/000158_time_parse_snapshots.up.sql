-- Time-parse snapshot tables for immutable clear-time and boss-kill-time scoring.
-- Mirrors the ranking_snapshots lifecycle pattern (pending → published) but
-- stores time metrics (durations in milliseconds) instead of DPS/HPS.
--
-- Policy version 1 (see internal/timeparsepolicy/policy.go):
--  • Clear time: qualified complete runs only; lower is better.
--  • Boss kill time: clean kills from cohort-eligible partial or complete runs.
--  • Duplicate run identity contributes one deterministic fastest datapoint.
--  • Cohort compatibility: tenant, instance name, difficulty, max raid size.
--  • Existing bounded lookback strategy.
--  • Minimum sample 5.
--  • Lower-is-better inclusive ties: count(value >= target) / N.
--  • Average encounter parse: arithmetic mean of per-boss parses with coverage.

-- time_parse_snapshots: One row per publication (tenant + lookback + cutoff).
CREATE TABLE time_parse_snapshots (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    cutoff            TIMESTAMPTZ NOT NULL,
    window_start      TIMESTAMPTZ,
    lookback_days     INT NOT NULL DEFAULT 0,
    policy_version    SMALLINT NOT NULL DEFAULT 1,
    query_version     SMALLINT NOT NULL DEFAULT 1,
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'published')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at      TIMESTAMPTZ,
    source_row_count  BIGINT NOT NULL DEFAULT 0,
    source_watermark  TIMESTAMPTZ,
    -- published_at must be set when status is 'published'.
    CHECK (status != 'published' OR published_at IS NOT NULL)
);

CREATE INDEX idx_tps_tenant_status ON time_parse_snapshots (tenant_id, status);
CREATE INDEX idx_tps_tenant_lookback ON time_parse_snapshots (tenant_id, lookback_days, published_at DESC NULLS LAST);

-- Unique published constraint: at most one published snapshot per logical key.
CREATE UNIQUE INDEX time_parse_snapshots_published_key_idx
    ON time_parse_snapshots (tenant_id, cutoff, lookback_days, policy_version, query_version)
    WHERE status = 'published';

-- time_parse_clear_time_members: One row per eligible complete run clear time.
-- Qualified complete runs with duration > 0. Duplicate groups collapsed to
-- one deterministic fastest representative.
CREATE TABLE time_parse_clear_time_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id       UUID NOT NULL REFERENCES time_parse_snapshots(id) ON DELETE CASCADE,
    instance_id       UUID NOT NULL,
    run_id            UUID NOT NULL,
    instance_name     TEXT NOT NULL,
    difficulty_name   TEXT NOT NULL DEFAULT '',
    max_players       SMALLINT NOT NULL DEFAULT 0,
    duration_ms       BIGINT NOT NULL,
    start_time        TIMESTAMPTZ NOT NULL,
    UNIQUE (snapshot_id, instance_id)
);

CREATE INDEX idx_tpctm_cohort ON time_parse_clear_time_members
    (snapshot_id, instance_name, difficulty_name, max_players);

-- time_parse_boss_kill_members: One row per eligible boss kill time.
-- Clean boss kills from cohort-eligible partial or complete runs.
-- Duplicate groups collapsed per encounter to one deterministic fastest.
CREATE TABLE time_parse_boss_kill_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id       UUID NOT NULL REFERENCES time_parse_snapshots(id) ON DELETE CASCADE,
    instance_id       UUID NOT NULL,
    run_id            UUID NOT NULL,
    instance_name     TEXT NOT NULL,
    encounter_name    TEXT NOT NULL,
    difficulty_name   TEXT NOT NULL DEFAULT '',
    max_players       SMALLINT NOT NULL DEFAULT 0,
    duration_ms       BIGINT NOT NULL,
    killed_at         TIMESTAMPTZ NOT NULL,
    UNIQUE (snapshot_id, instance_id, encounter_name)
);

CREATE INDEX idx_tpbkm_cohort ON time_parse_boss_kill_members
    (snapshot_id, instance_name, encounter_name, difficulty_name, max_players);
