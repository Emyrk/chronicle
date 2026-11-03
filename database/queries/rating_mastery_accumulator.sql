-- Persist one constant-size state per subject/window. The caller must use the
-- frozen manifest to select the window and rank weight. Replays do
-- not modify staging. Insert and update may share the checkpoint CAS transaction.
-- name: InitRatingMasteryAccumulator :exec
INSERT INTO rating_mastery_accumulators
    (generation_id, tenant_id, subject_kind, realm_id, subject_id, instance_name,
     encounter_name, difficulty_name, max_players, player_class, player_spec,
     player_sub_spec, performance_metric, window_kind)
VALUES (@generation_id, @tenant_id, @subject_kind, @realm_id, @subject_id,
        @instance_name, @encounter_name, @difficulty_name, @max_players,
        @player_class, @player_spec, @player_sub_spec, @performance_metric,
        @window_kind)
ON CONFLICT DO NOTHING;

-- name: GetRatingMasteryAccumulator :one
SELECT * FROM rating_mastery_accumulators
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND subject_kind = @subject_kind AND realm_id = @realm_id AND subject_id = @subject_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND window_kind = @window_kind;

-- All page fields are supplied together in a short transaction. The version
-- and pass CAS reject stale/replayed pages. On pass transition clear cursor,
-- set position=0; preserve completed pass aggregates. Caller verifies exactly
-- one updated row and advances the rebuild checkpoint in this SAME transaction.
-- Never commit an accumulator update if the checkpoint CAS returned zero.
-- name: AdvanceRatingMasteryAccumulator :execrows
UPDATE rating_mastery_accumulators AS acc
SET pass = @next_pass, version = acc.version + 1,
    cursor_score = sqlc.narg(next_cursor_score)::double precision,
    cursor_killed_at = sqlc.narg(next_cursor_killed_at)::timestamptz,
    cursor_run_id = sqlc.narg(next_cursor_run_id)::uuid,
    position = @next_position, eligible_kills = @next_eligible_kills,
    excluded_kills = @next_excluded_kills, best = @next_best,
    latest_retained_at = sqlc.narg(next_latest_retained_at)::timestamptz,
    total_weight = @next_total_weight, cumulative_weight = @next_cumulative_weight,
    floor_score = sqlc.narg(next_floor_score)::double precision,
    form_score = sqlc.narg(next_form_score)::double precision,
    last_retained_score = sqlc.narg(next_last_retained_score)::double precision
WHERE acc.generation_id = @generation_id AND acc.tenant_id = @tenant_id
  AND acc.subject_kind = @subject_kind AND acc.realm_id = @realm_id AND acc.subject_id = @subject_id
  AND acc.instance_name = @instance_name AND acc.encounter_name = @encounter_name
  AND acc.difficulty_name = @difficulty_name AND acc.max_players = @max_players
  AND acc.player_class = @player_class AND acc.player_spec = @player_spec
  AND acc.player_sub_spec = @player_sub_spec AND acc.performance_metric = @performance_metric
  AND acc.window_kind = @window_kind AND acc.pass = @expected_pass AND acc.version = @expected_version
  AND EXISTS (SELECT 1 FROM rating_score_generations gen
              WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id
                AND gen.status = 'building');

-- Stable ascending tie order is required to exclude exactly floor(N*0.2)
-- observations. NULL (unlocked) parses are never eligible. The page limit is
-- hard capped even if a caller supplies an excessive size. The first page
-- uses first_page=true; subsequent pages use the previous row's complete key.
-- name: ListRatingMasteryPlayerPage :many
SELECT locked_parse, killed_at, run_id FROM rating_stage_player_observations
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND realm_id = @realm_id AND player_guid = @player_guid
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND locked_parse BETWEEN 0 AND 100
  AND killed_at >= @window_start::timestamptz AND killed_at < @as_of::timestamptz
  AND (@first_page::boolean OR (locked_parse, killed_at, run_id) >
       (@after_score::double precision, @after_killed_at::timestamptz, @after_run_id::uuid))
ORDER BY locked_parse ASC, killed_at ASC, run_id ASC
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListRatingMasteryGuildPage :many
SELECT locked_parse, killed_at, run_id FROM rating_stage_guild_observations
WHERE generation_id = @generation_id AND tenant_id = @tenant_id
  AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND locked_parse BETWEEN 0 AND 100
  AND killed_at >= @window_start::timestamptz AND killed_at < @as_of::timestamptz
  AND (@first_page::boolean OR (locked_parse, killed_at, run_id) >
       (@after_score::double precision, @after_killed_at::timestamptz, @after_run_id::uuid))
ORDER BY locked_parse ASC, killed_at ASC, run_id ASC
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);
