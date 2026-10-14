BEGIN;

CREATE TABLE time_parse_score_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    run_id UUID NOT NULL,
    log_group_id UUID REFERENCES wow_log_groups(id) ON DELETE SET NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
    cutoff TIMESTAMPTZ NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    lookback_days SMALLINT NOT NULL,
    policy_version SMALLINT NOT NULL,
    query_version SMALLINT NOT NULL,
    source_count INT NOT NULL DEFAULT 0,
    result_count INT NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, instance_id, lookback_days, policy_version, query_version)
);

CREATE TABLE time_parse_score_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES time_parse_score_receipts(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    run_id UUID NOT NULL,
    log_group_id UUID REFERENCES wow_log_groups(id) ON DELETE SET NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
    scope TEXT NOT NULL CHECK (scope IN ('server', 'realm', 'guild')),
    metric_kind TEXT NOT NULL CHECK (metric_kind IN ('clear_time', 'boss_kill')),
    encounter_id UUID,
    encounter_name TEXT NOT NULL DEFAULT '',
    duration_ms BIGINT NOT NULL,
    precise_score DOUBLE PRECISION NOT NULL,
    display_score SMALLINT NOT NULL,
    rank INT NOT NULL,
    sample_size INT NOT NULL,
    status TEXT NOT NULL,
    cutoff TIMESTAMPTZ NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    lookback_days SMALLINT NOT NULL,
    policy_version SMALLINT NOT NULL,
    query_version SMALLINT NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((metric_kind = 'clear_time' AND encounter_id IS NULL AND encounter_name = '')
        OR (metric_kind = 'boss_kill' AND encounter_id IS NOT NULL AND encounter_name <> ''))
);

CREATE UNIQUE INDEX idx_time_parse_score_results_clear_unique
    ON time_parse_score_results (receipt_id, scope, metric_kind)
    WHERE encounter_id IS NULL;
CREATE UNIQUE INDEX idx_time_parse_score_results_boss_unique
    ON time_parse_score_results (receipt_id, scope, metric_kind, encounter_id)
    WHERE encounter_id IS NOT NULL;
CREATE INDEX idx_time_parse_score_receipts_contract
    ON time_parse_score_receipts (tenant_id, instance_id, policy_version, query_version, lookback_days);
CREATE INDEX idx_time_parse_score_receipts_missing
    ON time_parse_score_receipts (tenant_id, policy_version, query_version, lookback_days, instance_id);
CREATE INDEX idx_time_parse_score_results_instance
    ON time_parse_score_results (tenant_id, instance_id, scope, metric_kind);

COMMIT;
