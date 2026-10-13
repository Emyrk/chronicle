BEGIN;

-- Stores each current logical boss-kill cohort member once. Historical cohort
-- membership is derived from killed_at and the snapshot's configured lookback.
-- Later uploads and corrections intentionally affect historical comparisons.
CREATE TABLE time_parse_boss_kill_memberships (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    policy_version    SMALLINT NOT NULL,
    query_version     SMALLINT NOT NULL,
    run_id            UUID NOT NULL,
    encounter_name    TEXT NOT NULL,
    instance_id       UUID NOT NULL,
    log_group_id      UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE,
    instance_name     TEXT NOT NULL,
    difficulty_name   TEXT NOT NULL DEFAULT '',
    max_players       SMALLINT NOT NULL DEFAULT 0,
    duration_ms       BIGINT NOT NULL,
    killed_at         TIMESTAMPTZ NOT NULL,
    UNIQUE (
        tenant_id,
        policy_version,
        query_version,
        run_id,
        encounter_name
    )
);

CREATE INDEX idx_tpbk_memberships_log_group
    ON time_parse_boss_kill_memberships (log_group_id);

-- Supports cohort lookups by snapshot cutoff, lookback, and bucket dimensions.
CREATE INDEX idx_tpbk_memberships_cohort
    ON time_parse_boss_kill_memberships (
        tenant_id,
        policy_version,
        query_version,
        instance_name,
        encounter_name,
        difficulty_name,
        max_players,
        killed_at
    );

COMMIT;
