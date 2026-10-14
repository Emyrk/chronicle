BEGIN;

-- Pre-deploy impact check:
-- SELECT
--     (SELECT count(*) FROM time_parse_score_receipts) AS receipts,
--     (SELECT count(*) FROM time_parse_score_results) AS results;
-- This migration copies both tables and briefly blocks writes while swapping schemas.

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

WITH clear_scores AS (
    SELECT
        receipt_id,
        max(duration_ms) FILTER (WHERE scope = 'server') AS duration_ms,
        max(precise_score) FILTER (WHERE scope = 'server') AS server_precise_score,
        max(display_score) FILTER (WHERE scope = 'server') AS server_display_score,
        max(rank) FILTER (WHERE scope = 'server') AS server_rank,
        max(sample_size) FILTER (WHERE scope = 'server') AS server_sample_size,
        max(status) FILTER (WHERE scope = 'server') AS server_status,
        max(precise_score) FILTER (WHERE scope = 'realm') AS realm_precise_score,
        max(display_score) FILTER (WHERE scope = 'realm') AS realm_display_score,
        max(rank) FILTER (WHERE scope = 'realm') AS realm_rank,
        max(sample_size) FILTER (WHERE scope = 'realm') AS realm_sample_size,
        max(status) FILTER (WHERE scope = 'realm') AS realm_status,
        max(precise_score) FILTER (WHERE scope = 'guild') AS guild_precise_score,
        max(display_score) FILTER (WHERE scope = 'guild') AS guild_display_score,
        max(rank) FILTER (WHERE scope = 'guild') AS guild_rank,
        max(sample_size) FILTER (WHERE scope = 'guild') AS guild_sample_size,
        max(status) FILTER (WHERE scope = 'guild') AS guild_status
    FROM time_parse_score_results
    WHERE metric_kind = 'clear_time'
    GROUP BY receipt_id
)
INSERT INTO time_parse_scores (
    id, tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
    clear_duration_ms,
    clear_server_precise_score, clear_server_display_score, clear_server_rank,
    clear_server_sample_size, clear_server_status,
    clear_realm_precise_score, clear_realm_display_score, clear_realm_rank,
    clear_realm_sample_size, clear_realm_status,
    clear_guild_precise_score, clear_guild_display_score, clear_guild_rank,
    clear_guild_sample_size, clear_guild_status,
    cutoff, window_start, lookback_days, policy_version, query_version, computed_at
)
SELECT
    receipt.id, receipt.tenant_id, receipt.instance_id, receipt.run_id,
    receipt.log_group_id, receipt.realm_id, receipt.guild_id,
    clear.duration_ms,
    clear.server_precise_score, clear.server_display_score, clear.server_rank,
    clear.server_sample_size, clear.server_status,
    clear.realm_precise_score, clear.realm_display_score, clear.realm_rank,
    clear.realm_sample_size, clear.realm_status,
    clear.guild_precise_score, clear.guild_display_score, clear.guild_rank,
    clear.guild_sample_size, clear.guild_status,
    receipt.cutoff, receipt.window_start, receipt.lookback_days,
    receipt.policy_version, receipt.query_version, receipt.computed_at
FROM time_parse_score_receipts receipt
LEFT JOIN clear_scores clear ON clear.receipt_id = receipt.id;

WITH boss_scores AS (
    SELECT
        receipt_id,
        encounter_id,
        max(encounter_name) AS encounter_name,
        max(duration_ms) AS duration_ms,
        max(precise_score) FILTER (WHERE scope = 'server') AS server_precise_score,
        max(display_score) FILTER (WHERE scope = 'server') AS server_display_score,
        max(rank) FILTER (WHERE scope = 'server') AS server_rank,
        max(sample_size) FILTER (WHERE scope = 'server') AS server_sample_size,
        max(status) FILTER (WHERE scope = 'server') AS server_status,
        max(precise_score) FILTER (WHERE scope = 'realm') AS realm_precise_score,
        max(display_score) FILTER (WHERE scope = 'realm') AS realm_display_score,
        max(rank) FILTER (WHERE scope = 'realm') AS realm_rank,
        max(sample_size) FILTER (WHERE scope = 'realm') AS realm_sample_size,
        max(status) FILTER (WHERE scope = 'realm') AS realm_status,
        max(precise_score) FILTER (WHERE scope = 'guild') AS guild_precise_score,
        max(display_score) FILTER (WHERE scope = 'guild') AS guild_display_score,
        max(rank) FILTER (WHERE scope = 'guild') AS guild_rank,
        max(sample_size) FILTER (WHERE scope = 'guild') AS guild_sample_size,
        max(status) FILTER (WHERE scope = 'guild') AS guild_status
    FROM time_parse_score_results
    WHERE metric_kind = 'boss_kill'
    GROUP BY receipt_id, encounter_id
)
INSERT INTO time_parse_boss_scores (
    time_parse_score_id, encounter_id, encounter_name, duration_ms,
    server_precise_score, server_display_score, server_rank, server_sample_size, server_status,
    realm_precise_score, realm_display_score, realm_rank, realm_sample_size, realm_status,
    guild_precise_score, guild_display_score, guild_rank, guild_sample_size, guild_status
)
SELECT
    receipt_id, encounter_id, encounter_name, duration_ms,
    server_precise_score, server_display_score, server_rank, server_sample_size, server_status,
    realm_precise_score, realm_display_score, realm_rank, realm_sample_size, realm_status,
    guild_precise_score, guild_display_score, guild_rank, guild_sample_size, guild_status
FROM boss_scores;

CREATE INDEX idx_time_parse_scores_contract
    ON time_parse_scores (tenant_id, instance_id, policy_version, query_version, lookback_days);
CREATE INDEX idx_time_parse_scores_missing
    ON time_parse_scores (tenant_id, policy_version, query_version, lookback_days, instance_id);

DROP TABLE time_parse_score_results;
DROP TABLE time_parse_score_receipts;

COMMIT;
