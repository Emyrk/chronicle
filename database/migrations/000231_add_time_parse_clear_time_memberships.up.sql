BEGIN;

-- Stores each current logical clear-time cohort member once. Historical cohort
-- membership is derived from start_time and each snapshot's cutoff/lookback.
-- Later uploads, corrections, and invalidations intentionally affect old scores.
CREATE TABLE time_parse_clear_time_memberships (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    policy_version    SMALLINT NOT NULL,
    query_version     SMALLINT NOT NULL,
    run_id            UUID NOT NULL,
    instance_id       UUID NOT NULL,
    log_group_id      UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE,
    instance_name     TEXT NOT NULL,
    difficulty_name   TEXT NOT NULL DEFAULT '',
    max_players       SMALLINT NOT NULL DEFAULT 0,
    duration_ms       BIGINT NOT NULL,
    start_time        TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, policy_version, query_version, run_id)
);

CREATE INDEX idx_tpct_memberships_log_group
    ON time_parse_clear_time_memberships (log_group_id);

CREATE INDEX idx_tpct_memberships_instance
    ON time_parse_clear_time_memberships (instance_id);

-- Supports cohort lookups by snapshot cutoff, lookback, and bucket dimensions.
CREATE INDEX idx_tpct_memberships_cohort
    ON time_parse_clear_time_memberships (
        tenant_id,
        policy_version,
        query_version,
        instance_name,
        difficulty_name,
        max_players,
        start_time
    );

COMMIT;
