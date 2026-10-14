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

INSERT INTO time_parse_score_receipts (
    id, tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
    cutoff, window_start, lookback_days, policy_version, query_version,
    source_count, result_count, computed_at
)
SELECT
    score.id, score.tenant_id, score.instance_id, score.run_id,
    score.log_group_id, score.realm_id, score.guild_id,
    score.cutoff, score.window_start, score.lookback_days,
    score.policy_version, score.query_version,
    (CASE WHEN score.clear_duration_ms IS NULL THEN 0 ELSE 1 END
        + (SELECT count(*) FROM time_parse_boss_scores boss
           WHERE boss.time_parse_score_id = score.id))::int,
    (CASE
        WHEN score.clear_duration_ms IS NULL THEN 0
        WHEN score.guild_id IS NULL THEN 2
        ELSE 3
     END
        + COALESCE((SELECT sum(CASE WHEN boss.guild_status IS NULL THEN 2 ELSE 3 END)
                    FROM time_parse_boss_scores boss
                    WHERE boss.time_parse_score_id = score.id), 0))::int,
    score.computed_at
FROM time_parse_scores score;

INSERT INTO time_parse_score_results (
    receipt_id, tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
    scope, metric_kind, encounter_id, encounter_name, duration_ms,
    precise_score, display_score, rank, sample_size, status,
    cutoff, window_start, lookback_days, policy_version, query_version, computed_at
)
SELECT
    score.id, score.tenant_id, score.instance_id, score.run_id,
    score.log_group_id, score.realm_id, score.guild_id,
    scoped.scope, 'clear_time', NULL, '', score.clear_duration_ms,
    scoped.precise_score, scoped.display_score, scoped.rank, scoped.sample_size, scoped.status,
    score.cutoff, score.window_start, score.lookback_days,
    score.policy_version, score.query_version, score.computed_at
FROM time_parse_scores score
CROSS JOIN LATERAL (
    VALUES
        ('server', score.clear_server_precise_score, score.clear_server_display_score,
            score.clear_server_rank, score.clear_server_sample_size, score.clear_server_status),
        ('realm', score.clear_realm_precise_score, score.clear_realm_display_score,
            score.clear_realm_rank, score.clear_realm_sample_size, score.clear_realm_status),
        ('guild', score.clear_guild_precise_score, score.clear_guild_display_score,
            score.clear_guild_rank, score.clear_guild_sample_size, score.clear_guild_status)
) AS scoped(scope, precise_score, display_score, rank, sample_size, status)
WHERE score.clear_duration_ms IS NOT NULL
  AND scoped.status IS NOT NULL;

INSERT INTO time_parse_score_results (
    receipt_id, tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
    scope, metric_kind, encounter_id, encounter_name, duration_ms,
    precise_score, display_score, rank, sample_size, status,
    cutoff, window_start, lookback_days, policy_version, query_version, computed_at
)
SELECT
    score.id, score.tenant_id, score.instance_id, score.run_id,
    score.log_group_id, score.realm_id, score.guild_id,
    scoped.scope, 'boss_kill', boss.encounter_id, boss.encounter_name, boss.duration_ms,
    scoped.precise_score, scoped.display_score, scoped.rank, scoped.sample_size, scoped.status,
    score.cutoff, score.window_start, score.lookback_days,
    score.policy_version, score.query_version, score.computed_at
FROM time_parse_scores score
JOIN time_parse_boss_scores boss ON boss.time_parse_score_id = score.id
CROSS JOIN LATERAL (
    VALUES
        ('server', boss.server_precise_score, boss.server_display_score,
            boss.server_rank, boss.server_sample_size, boss.server_status),
        ('realm', boss.realm_precise_score, boss.realm_display_score,
            boss.realm_rank, boss.realm_sample_size, boss.realm_status),
        ('guild', boss.guild_precise_score, boss.guild_display_score,
            boss.guild_rank, boss.guild_sample_size, boss.guild_status)
) AS scoped(scope, precise_score, display_score, rank, sample_size, status)
WHERE scoped.status IS NOT NULL;

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

DROP TABLE time_parse_boss_scores;
DROP TABLE time_parse_scores;

COMMIT;
