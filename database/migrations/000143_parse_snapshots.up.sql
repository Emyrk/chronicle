-- Add parse_config JSONB column to tenants and site_config.
-- Follows the branding JSONB pattern: nullable, typed in Go.
ALTER TABLE tenants ADD COLUMN parse_config JSONB;
ALTER TABLE site_config ADD COLUMN parse_config JSONB;

-- Immutable comparison snapshots for parse scoring.
-- One row per (tenant, lookback, cutoff) publication.
-- No RLS — filtered explicitly by tenant_id like rankings_instance_summaries.
CREATE TABLE ranking_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- uuid.Nil = root domain (untenanted + include_in_all realms).
    tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    cutoff          TIMESTAMPTZ NOT NULL,
    window_start    TIMESTAMPTZ,
    lookback_days   INT NOT NULL DEFAULT 0,
    cohort_mode     TEXT NOT NULL DEFAULT 'spec',
    policy_version  SMALLINT NOT NULL DEFAULT 1,
    query_version   SMALLINT NOT NULL DEFAULT 1,
    -- Parser/addon version requirements captured at snapshot time.
    min_parser_version_num BIGINT NOT NULL DEFAULT 0,
    min_addon_version_num  BIGINT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ
);

CREATE INDEX idx_rs_tenant_status ON ranking_snapshots (tenant_id, status);
CREATE INDEX idx_rs_tenant_lookback ON ranking_snapshots (tenant_id, lookback_days, published_at DESC NULLS LAST);

-- Members: one row per eligible encounter_dps_rankings entry within a snapshot.
-- Denormalized for fast cohort queries without joining encounter_dps_rankings.
CREATE TABLE ranking_snapshot_members (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id         UUID NOT NULL REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
    ranking_id          UUID NOT NULL REFERENCES encounter_dps_rankings(id) ON DELETE CASCADE,
    -- Denormalized from encounter_dps_rankings for cohort queries.
    instance_id         UUID NOT NULL,
    run_id              UUID NOT NULL,  -- COALESCE(duplicate_group_id, instance_id)
    instance_name       TEXT NOT NULL,
    encounter_name      TEXT NOT NULL,
    player_guid         TEXT NOT NULL,
    player_class        TEXT NOT NULL,
    player_spec         TEXT NOT NULL,
    difficulty_name     TEXT NOT NULL DEFAULT '',
    max_players         SMALLINT NOT NULL DEFAULT 0,
    killed_at           TIMESTAMPTZ NOT NULL,
    created_at_ranking  TIMESTAMPTZ NOT NULL,
    damage_done         BIGINT NOT NULL,
    healing_done        BIGINT NOT NULL DEFAULT 0,
    absorbed_done       BIGINT NOT NULL DEFAULT 0,
    duration_secs       DOUBLE PRECISION NOT NULL,
    dps                 DOUBLE PRECISION NOT NULL,
    hps                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- Idempotent publication: same ranking row can't appear twice in one snapshot.
    UNIQUE (snapshot_id, ranking_id)
);

-- Cohort selection: best per player per (snapshot, encounter, class or spec bucket).
CREATE INDEX idx_rsm_cohort_spec ON ranking_snapshot_members (snapshot_id, encounter_name, difficulty_name, max_players, player_class, player_spec);
CREATE INDEX idx_rsm_cohort_class ON ranking_snapshot_members (snapshot_id, encounter_name, difficulty_name, max_players, player_class);
-- Player history.
CREATE INDEX idx_rsm_player ON ranking_snapshot_members (snapshot_id, player_guid);
-- Instance members listing.
CREATE INDEX idx_rsm_instance ON ranking_snapshot_members (snapshot_id, instance_id);
