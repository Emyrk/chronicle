BEGIN;

CREATE TABLE time_parse_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    run_id UUID NOT NULL,
    log_group_id UUID REFERENCES wow_log_groups(id) ON DELETE SET NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,

    clear_duration_ms BIGINT,
    clear_server_precise_score DOUBLE PRECISION,
    clear_server_display_score SMALLINT,
    clear_server_rank INT,
    clear_server_sample_size INT,
    clear_server_status TEXT,
    clear_realm_precise_score DOUBLE PRECISION,
    clear_realm_display_score SMALLINT,
    clear_realm_rank INT,
    clear_realm_sample_size INT,
    clear_realm_status TEXT,
    clear_guild_precise_score DOUBLE PRECISION,
    clear_guild_display_score SMALLINT,
    clear_guild_rank INT,
    clear_guild_sample_size INT,
    clear_guild_status TEXT,

    CHECK (
        (clear_duration_ms IS NULL
            AND clear_server_precise_score IS NULL AND clear_server_display_score IS NULL
            AND clear_server_rank IS NULL AND clear_server_sample_size IS NULL AND clear_server_status IS NULL
            AND clear_realm_precise_score IS NULL AND clear_realm_display_score IS NULL
            AND clear_realm_rank IS NULL AND clear_realm_sample_size IS NULL AND clear_realm_status IS NULL
            AND clear_guild_precise_score IS NULL AND clear_guild_display_score IS NULL
            AND clear_guild_rank IS NULL AND clear_guild_sample_size IS NULL AND clear_guild_status IS NULL)
        OR
        (clear_duration_ms IS NOT NULL
            AND clear_server_precise_score IS NOT NULL AND clear_server_display_score IS NOT NULL
            AND clear_server_rank IS NOT NULL AND clear_server_sample_size IS NOT NULL AND clear_server_status IS NOT NULL
            AND clear_realm_precise_score IS NOT NULL AND clear_realm_display_score IS NOT NULL
            AND clear_realm_rank IS NOT NULL AND clear_realm_sample_size IS NOT NULL AND clear_realm_status IS NOT NULL
            AND ((guild_id IS NULL
                    AND clear_guild_precise_score IS NULL AND clear_guild_display_score IS NULL
                    AND clear_guild_rank IS NULL AND clear_guild_sample_size IS NULL AND clear_guild_status IS NULL)
                OR (guild_id IS NOT NULL
                    AND clear_guild_precise_score IS NOT NULL AND clear_guild_display_score IS NOT NULL
                    AND clear_guild_rank IS NOT NULL AND clear_guild_sample_size IS NOT NULL AND clear_guild_status IS NOT NULL)))
    ),

    cutoff TIMESTAMPTZ NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    lookback_days SMALLINT NOT NULL,
    policy_version SMALLINT NOT NULL,
    query_version SMALLINT NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, instance_id, lookback_days, policy_version, query_version)
);

CREATE TABLE time_parse_boss_scores (
    time_parse_score_id UUID NOT NULL REFERENCES time_parse_scores(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    encounter_name TEXT NOT NULL,
    duration_ms BIGINT NOT NULL,

    server_precise_score DOUBLE PRECISION NOT NULL,
    server_display_score SMALLINT NOT NULL,
    server_rank INT NOT NULL,
    server_sample_size INT NOT NULL,
    server_status TEXT NOT NULL,
    realm_precise_score DOUBLE PRECISION NOT NULL,
    realm_display_score SMALLINT NOT NULL,
    realm_rank INT NOT NULL,
    realm_sample_size INT NOT NULL,
    realm_status TEXT NOT NULL,
    guild_precise_score DOUBLE PRECISION,
    guild_display_score SMALLINT,
    guild_rank INT,
    guild_sample_size INT,
    guild_status TEXT,

    CHECK (
        (guild_precise_score IS NULL AND guild_display_score IS NULL AND guild_rank IS NULL
            AND guild_sample_size IS NULL AND guild_status IS NULL)
        OR
        (guild_precise_score IS NOT NULL AND guild_display_score IS NOT NULL AND guild_rank IS NOT NULL
            AND guild_sample_size IS NOT NULL AND guild_status IS NOT NULL)
    ),

    PRIMARY KEY (time_parse_score_id, encounter_id)
);

CREATE INDEX idx_time_parse_scores_contract
    ON time_parse_scores (tenant_id, instance_id, policy_version, query_version, lookback_days);
CREATE INDEX idx_time_parse_scores_missing
    ON time_parse_scores (tenant_id, policy_version, query_version, lookback_days, instance_id);

COMMIT;
