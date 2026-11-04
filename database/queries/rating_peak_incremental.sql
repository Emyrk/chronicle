-- A cohort dirty key covers all subjects and both windows. Lock it before
-- computing the tenant-wide best; new observations increment its revision.
-- name: LockDirtyPeakCohorts :many
SELECT tenant_id, subject_kind, instance_name, encounter_name, difficulty_name,
       max_players, player_class, player_spec, player_sub_spec, performance_metric, revision
FROM rating_dirty_peak_cohorts WHERE tenant_id = @tenant_id
ORDER BY changed_at, subject_kind, instance_name, encounter_name, difficulty_name,
         max_players, player_class, player_spec, player_sub_spec, performance_metric
LIMIT LEAST(GREATEST(@batch_size::int, 0), 16)
FOR UPDATE SKIP LOCKED;

-- name: ListDirtyPeakTenants :many
SELECT DISTINCT tenant_id FROM rating_dirty_peak_cohorts ORDER BY tenant_id;

-- name: DeleteDirtyPeakCohortIfRevision :execrows
DELETE FROM rating_dirty_peak_cohorts
WHERE tenant_id = @tenant_id AND subject_kind = @subject_kind
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND revision = @revision;

-- Guildless observations count toward guild rank one. The player and guild
-- cohorts are tenant-wide (not partitioned by realm or visible UI filters).
-- name: CalculateLivePeakCohortDenominators :one
WITH player AS (
    SELECT COALESCE(MAX(p.raw_value), 0)::double precision AS all_time,
           COALESCE(MAX(p.raw_value) FILTER (WHERE p.killed_at >= @period_start::timestamptz), 0)::double precision AS period
    FROM rating_live_player_observations p
    WHERE @subject_kind::text = 'player' AND p.tenant_id = @tenant_id
      AND p.instance_name = @instance_name AND p.encounter_name = @encounter_name
      AND p.difficulty_name = @difficulty_name AND p.max_players = @max_players
      AND p.player_class = @player_class AND p.player_spec = @player_spec
      AND p.player_sub_spec = @player_sub_spec AND p.performance_metric = @performance_metric
      AND p.killed_at < @as_of::timestamptz
), guild AS (
    SELECT COALESCE(MIN(g.raw_duration_ms), 0)::double precision AS all_time,
           COALESCE(MIN(g.raw_duration_ms) FILTER (WHERE g.killed_at >= @period_start::timestamptz), 0)::double precision AS period
    FROM rating_live_guild_observations g
    WHERE @subject_kind::text = 'guild' AND g.tenant_id = @tenant_id
      AND g.instance_name = @instance_name AND g.encounter_name = @encounter_name
      AND g.difficulty_name = @difficulty_name AND g.max_players = @max_players
      AND g.killed_at < @as_of::timestamptz
)
SELECT player.all_time AS player_all_time, player.period AS player_period,
       guild.all_time AS guild_all_time, guild.period AS guild_period
FROM player CROSS JOIN guild;

-- name: UpsertLivePeakCohortDenominator :execrows
INSERT INTO rating_peak_cohort_denominators
    (generation_id, tenant_id, subject_kind, instance_name, encounter_name,
     difficulty_name, max_players, player_class, player_spec, player_sub_spec,
     performance_metric, window_kind, window_start, window_end, rank_one_raw)
SELECT gen.id, gen.tenant_id, @subject_kind, @instance_name, @encounter_name,
       @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
       @performance_metric, @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, @rank_one_raw::double precision
FROM rating_score_generations gen
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id
  AND gen.status = 'active' AND @rank_one_raw::double precision > 0
ON CONFLICT (generation_id, tenant_id, subject_kind, instance_name, encounter_name,
             difficulty_name, max_players, player_class, player_spec, player_sub_spec,
             performance_metric, window_kind)
DO UPDATE SET rank_one_raw = EXCLUDED.rank_one_raw, window_start = EXCLUDED.window_start,
              window_end = EXCLUDED.window_end, updated_at = now();

-- name: DeleteLivePeakCohortDenominator :exec
DELETE FROM rating_peak_cohort_denominators
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND subject_kind = @subject_kind AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND window_kind = @window_kind;
