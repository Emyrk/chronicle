BEGIN;

CREATE TABLE instance_overview_metrics (
    instance_id UUID PRIMARY KEY REFERENCES log_instances(id) ON DELETE CASCADE,
    requirements_complete BOOLEAN,
    player_deaths INTEGER NOT NULL,
    wipe_count INTEGER NOT NULL,
    top_incoming_damage_abilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    encounter_span_duration_ms BIGINT NOT NULL,
    total_combat_duration_ms BIGINT NOT NULL,
    total_boss_duration_ms BIGINT NOT NULL,
    metrics_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT instance_overview_metrics_player_deaths_nonnegative CHECK (player_deaths >= 0),
    CONSTRAINT instance_overview_metrics_wipe_count_nonnegative CHECK (wipe_count >= 0),
    CONSTRAINT instance_overview_metrics_encounter_span_nonnegative CHECK (encounter_span_duration_ms >= 0),
    CONSTRAINT instance_overview_metrics_combat_duration_nonnegative CHECK (total_combat_duration_ms >= 0),
    CONSTRAINT instance_overview_metrics_boss_duration_nonnegative CHECK (total_boss_duration_ms >= 0),
    CONSTRAINT instance_overview_metrics_combat_within_total CHECK (total_combat_duration_ms <= encounter_span_duration_ms),
    CONSTRAINT instance_overview_metrics_boss_within_combat CHECK (total_boss_duration_ms <= total_combat_duration_ms)
);

CREATE INDEX instance_speedruns_cohort_lookup_idx
    ON instance_speedruns (instance_name, start_time);

COMMIT;
