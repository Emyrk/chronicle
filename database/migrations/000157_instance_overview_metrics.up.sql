BEGIN;

CREATE TABLE instance_overview_metrics (
    instance_id UUID PRIMARY KEY REFERENCES log_instances(id) ON DELETE CASCADE,
    complete BOOLEAN,
    player_deaths INTEGER NOT NULL,
    wipe_count INTEGER NOT NULL,
    deadliest_abilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_duration_ms BIGINT NOT NULL,
    total_combat_duration_ms BIGINT NOT NULL,
    total_boss_duration_ms BIGINT NOT NULL,
    metrics_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT instance_overview_metrics_player_deaths_nonnegative CHECK (player_deaths >= 0),
    CONSTRAINT instance_overview_metrics_wipe_count_nonnegative CHECK (wipe_count >= 0),
    CONSTRAINT instance_overview_metrics_total_duration_nonnegative CHECK (total_duration_ms >= 0),
    CONSTRAINT instance_overview_metrics_combat_duration_nonnegative CHECK (total_combat_duration_ms >= 0),
    CONSTRAINT instance_overview_metrics_boss_duration_nonnegative CHECK (total_boss_duration_ms >= 0),
    CONSTRAINT instance_overview_metrics_combat_within_total CHECK (total_combat_duration_ms <= total_duration_ms),
    CONSTRAINT instance_overview_metrics_boss_within_combat CHECK (total_boss_duration_ms <= total_combat_duration_ms)
);

COMMIT;
