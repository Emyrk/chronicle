-- name: UpsertInstanceOverviewMetrics :exec
INSERT INTO instance_overview_metrics (
    instance_id,
    complete,
    player_deaths,
    wipe_count,
    deadliest_abilities,
    total_duration_ms,
    total_combat_duration_ms,
    total_boss_duration_ms,
    metrics_version
) VALUES (
    @instance_id,
    @complete,
    @player_deaths,
    @wipe_count,
    @deadliest_abilities,
    @total_duration_ms,
    @total_combat_duration_ms,
    @total_boss_duration_ms,
    @metrics_version
)
ON CONFLICT (instance_id) DO UPDATE SET
    complete = EXCLUDED.complete,
    player_deaths = EXCLUDED.player_deaths,
    wipe_count = EXCLUDED.wipe_count,
    deadliest_abilities = EXCLUDED.deadliest_abilities,
    total_duration_ms = EXCLUDED.total_duration_ms,
    total_combat_duration_ms = EXCLUDED.total_combat_duration_ms,
    total_boss_duration_ms = EXCLUDED.total_boss_duration_ms,
    metrics_version = EXCLUDED.metrics_version,
    updated_at = now();

-- name: GetInstanceOverviewMetrics :one
SELECT *
FROM instance_overview_metrics
WHERE instance_id = @instance_id;
