-- Only retired generations with remaining ephemeral state are eligible. This
-- preserves published score rows and generation identities independently.
-- name: NextRetiredRatingStageGeneration :one
SELECT gen.id
FROM rating_score_generations gen
WHERE gen.status = 'retired'
  AND (
    EXISTS (SELECT 1 FROM rating_stage_player_observations stage WHERE stage.generation_id = gen.id)
    OR
    EXISTS (SELECT 1 FROM rating_stage_guild_observations stage WHERE stage.generation_id = gen.id)
    OR
    EXISTS (SELECT 1 FROM rating_stage_player_renown stage WHERE stage.generation_id = gen.id)
    OR
    EXISTS (SELECT 1 FROM rating_stage_guild_renown stage WHERE stage.generation_id = gen.id)
    OR
    EXISTS (SELECT 1 FROM rating_mastery_accumulators stage WHERE stage.generation_id = gen.id)
  )
ORDER BY gen.id
LIMIT 1;

-- A single invocation deletes at most 200 rows. The PK begins with
-- generation_id, so both selection and deletion are generation-local.
-- name: DeleteRetiredRatingStagePlayerObservationsPage :one
WITH page AS (
    SELECT stage.generation_id,
           stage.run_id,
           stage.player_guid,
           stage.instance_name,
           stage.encounter_name,
           stage.difficulty_name,
           stage.max_players,
           stage.player_class,
           stage.player_spec,
           stage.player_sub_spec,
           stage.performance_metric
    FROM rating_stage_player_observations stage
    JOIN rating_score_generations gen ON gen.id = stage.generation_id
    WHERE stage.generation_id = @generation_id AND gen.status = 'retired'
    ORDER BY stage.generation_id,
             stage.run_id,
             stage.player_guid,
             stage.instance_name,
             stage.encounter_name,
             stage.difficulty_name,
             stage.max_players,
             stage.player_class,
             stage.player_spec,
             stage.player_sub_spec,
             stage.performance_metric
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
), deleted AS (
    DELETE FROM rating_stage_player_observations stage USING page
    WHERE stage.generation_id = page.generation_id
      AND stage.run_id = page.run_id
      AND stage.player_guid = page.player_guid
      AND stage.instance_name = page.instance_name
      AND stage.encounter_name = page.encounter_name
      AND stage.difficulty_name = page.difficulty_name
      AND stage.max_players = page.max_players
      AND stage.player_class = page.player_class
      AND stage.player_spec = page.player_spec
      AND stage.player_sub_spec = page.player_sub_spec
      AND stage.performance_metric = page.performance_metric
    RETURNING 1
)
SELECT count(*)::int FROM deleted;

-- A single invocation deletes at most 200 rows. The PK begins with
-- generation_id, so both selection and deletion are generation-local.
-- name: DeleteRetiredRatingStageGuildObservationsPage :one
WITH page AS (
    SELECT stage.generation_id,
           stage.run_id,
           stage.encounter_name
    FROM rating_stage_guild_observations stage
    JOIN rating_score_generations gen ON gen.id = stage.generation_id
    WHERE stage.generation_id = @generation_id AND gen.status = 'retired'
    ORDER BY stage.generation_id,
             stage.run_id,
             stage.encounter_name
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
), deleted AS (
    DELETE FROM rating_stage_guild_observations stage USING page
    WHERE stage.generation_id = page.generation_id
      AND stage.run_id = page.run_id
      AND stage.encounter_name = page.encounter_name
    RETURNING 1
)
SELECT count(*)::int FROM deleted;

-- A single invocation deletes at most 200 rows. The PK begins with
-- generation_id, so both selection and deletion are generation-local.
-- name: DeleteRetiredRatingStagePlayerRenownPage :one
WITH page AS (
    SELECT stage.generation_id,
           stage.source_id
    FROM rating_stage_player_renown stage
    JOIN rating_score_generations gen ON gen.id = stage.generation_id
    WHERE stage.generation_id = @generation_id AND gen.status = 'retired'
    ORDER BY stage.generation_id,
             stage.source_id
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
), deleted AS (
    DELETE FROM rating_stage_player_renown stage USING page
    WHERE stage.generation_id = page.generation_id
      AND stage.source_id = page.source_id
    RETURNING 1
)
SELECT count(*)::int FROM deleted;

-- A single invocation deletes at most 200 rows. The PK begins with
-- generation_id, so both selection and deletion are generation-local.
-- name: DeleteRetiredRatingStageGuildRenownPage :one
WITH page AS (
    SELECT stage.generation_id,
           stage.source_id
    FROM rating_stage_guild_renown stage
    JOIN rating_score_generations gen ON gen.id = stage.generation_id
    WHERE stage.generation_id = @generation_id AND gen.status = 'retired'
    ORDER BY stage.generation_id,
             stage.source_id
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
), deleted AS (
    DELETE FROM rating_stage_guild_renown stage USING page
    WHERE stage.generation_id = page.generation_id
      AND stage.source_id = page.source_id
    RETURNING 1
)
SELECT count(*)::int FROM deleted;

-- A single invocation deletes at most 200 rows. The PK begins with
-- generation_id, so both selection and deletion are generation-local.
-- name: DeleteRetiredRatingStageMasteryAccumulatorsPage :one
WITH page AS (
    SELECT stage.generation_id,
           stage.subject_kind,
           stage.realm_id,
           stage.subject_id,
           stage.instance_name,
           stage.encounter_name,
           stage.difficulty_name,
           stage.max_players,
           stage.player_class,
           stage.player_spec,
           stage.player_sub_spec,
           stage.performance_metric,
           stage.window_kind
    FROM rating_mastery_accumulators stage
    JOIN rating_score_generations gen ON gen.id = stage.generation_id
    WHERE stage.generation_id = @generation_id AND gen.status = 'retired'
    ORDER BY stage.generation_id,
             stage.subject_kind,
             stage.realm_id,
             stage.subject_id,
             stage.instance_name,
             stage.encounter_name,
             stage.difficulty_name,
             stage.max_players,
             stage.player_class,
             stage.player_spec,
             stage.player_sub_spec,
             stage.performance_metric,
             stage.window_kind
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
), deleted AS (
    DELETE FROM rating_mastery_accumulators stage USING page
    WHERE stage.generation_id = page.generation_id
      AND stage.subject_kind = page.subject_kind
      AND stage.realm_id = page.realm_id
      AND stage.subject_id = page.subject_id
      AND stage.instance_name = page.instance_name
      AND stage.encounter_name = page.encounter_name
      AND stage.difficulty_name = page.difficulty_name
      AND stage.max_players = page.max_players
      AND stage.player_class = page.player_class
      AND stage.player_spec = page.player_spec
      AND stage.player_sub_spec = page.player_sub_spec
      AND stage.performance_metric = page.performance_metric
      AND stage.window_kind = page.window_kind
    RETURNING 1
)
SELECT count(*)::int FROM deleted;
