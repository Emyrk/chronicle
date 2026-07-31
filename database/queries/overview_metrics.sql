-- name: UpsertInstanceOverviewMetrics :exec
INSERT INTO instance_overview_metrics (
    instance_id,
    requirements_complete,
    player_deaths,
    wipe_count,
    top_incoming_damage_abilities,
    encounter_span_duration_ms,
    total_combat_duration_ms,
    total_boss_duration_ms,
    metrics_version
) VALUES (
    @instance_id,
    @requirements_complete,
    @player_deaths,
    @wipe_count,
    @top_incoming_damage_abilities,
    @encounter_span_duration_ms,
    @total_combat_duration_ms,
    @total_boss_duration_ms,
    @metrics_version
)
ON CONFLICT (instance_id) DO UPDATE SET
    requirements_complete = EXCLUDED.requirements_complete,
    player_deaths = EXCLUDED.player_deaths,
    wipe_count = EXCLUDED.wipe_count,
    top_incoming_damage_abilities = EXCLUDED.top_incoming_damage_abilities,
    encounter_span_duration_ms = EXCLUDED.encounter_span_duration_ms,
    total_combat_duration_ms = EXCLUDED.total_combat_duration_ms,
    total_boss_duration_ms = EXCLUDED.total_boss_duration_ms,
    metrics_version = EXCLUDED.metrics_version,
    updated_at = now();

-- name: GetInstanceOverviewMetrics :one
SELECT *
FROM instance_overview_metrics
WHERE instance_id = @instance_id
  AND metrics_version = @metrics_version;
