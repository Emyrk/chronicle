-- Set-based tenant Mastery calculation. Each query computes both all-time and
-- period windows for a bounded subject page. The caller writes the returned
-- rows and advances the rebuild checkpoint in one transaction.

-- name: CalculateTenantPlayerMasteryPage :many
WITH keys AS MATERIALIZED (
    SELECT DISTINCT stage.realm_id, stage.player_guid, stage.instance_name, stage.encounter_name,
           stage.difficulty_name, stage.max_players, stage.player_class, stage.player_spec,
           stage.player_sub_spec, stage.performance_metric
    FROM rating_stage_player_observations stage
    WHERE stage.generation_id = @generation_id AND stage.tenant_id = @tenant_id
      AND stage.locked_parse BETWEEN 0 AND 100 AND stage.killed_at < @as_of::timestamptz
      AND (stage.realm_id, stage.player_guid, stage.instance_name, stage.encounter_name,
           stage.difficulty_name, stage.max_players, stage.player_class, stage.player_spec,
           stage.player_sub_spec, stage.performance_metric) >
          (@after_realm_id::uuid, @after_player_guid::text, @after_instance_name::text,
           @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint,
           @after_player_class::text, @after_player_spec::text, @after_player_sub_spec::text,
           @after_performance_metric::text)
    ORDER BY stage.realm_id, stage.player_guid, stage.instance_name, stage.encounter_name,
             stage.difficulty_name, stage.max_players, stage.player_class, stage.player_spec,
             stage.player_sub_spec, stage.performance_metric
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
), windows AS (
    SELECT 'all_time'::text AS window_kind, @all_time_start::timestamptz AS window_start,
           NULL::timestamptz AS stored_start, NULL::timestamptz AS stored_end
    UNION ALL
    SELECT 'period'::text, @period_start::timestamptz, @period_start::timestamptz, @as_of::timestamptz
), ordered AS MATERIALIZED (
    SELECT k.*, w.window_kind,
           stage.locked_parse::double precision AS score,
           (row_number() OVER (
               PARTITION BY k.realm_id, k.player_guid, k.instance_name, k.encounter_name,
                            k.difficulty_name, k.max_players, k.player_class, k.player_spec,
                            k.player_sub_spec, k.performance_metric, w.window_kind
               ORDER BY stage.locked_parse, stage.killed_at, stage.run_id
           ) - 1)::bigint AS position,
           count(*) OVER (
               PARTITION BY k.realm_id, k.player_guid, k.instance_name, k.encounter_name,
                            k.difficulty_name, k.max_players, k.player_class, k.player_spec,
                            k.player_sub_spec, k.performance_metric, w.window_kind
           )::bigint AS eligible_kills
    FROM keys k
    CROSS JOIN windows w
    JOIN rating_stage_player_observations stage
      ON stage.generation_id = @generation_id AND stage.tenant_id = @tenant_id
     AND stage.realm_id = k.realm_id AND stage.player_guid = k.player_guid
     AND stage.instance_name = k.instance_name AND stage.encounter_name = k.encounter_name
     AND stage.difficulty_name = k.difficulty_name AND stage.max_players = k.max_players
     AND stage.player_class = k.player_class AND stage.player_spec = k.player_spec
     AND stage.player_sub_spec = k.player_sub_spec AND stage.performance_metric = k.performance_metric
     AND stage.locked_parse BETWEEN 0 AND 100
     AND stage.killed_at >= w.window_start AND stage.killed_at < @as_of::timestamptz
), classified AS MATERIALIZED (
    SELECT ordered.*,
           CASE WHEN eligible_kills >= 5 THEN eligible_kills / 5 ELSE 0 END AS excluded_kills
    FROM ordered
), summary AS MATERIALIZED (
    SELECT realm_id, player_guid, instance_name, encounter_name, difficulty_name,
           max_players, player_class, player_spec, player_sub_spec, performance_metric,
           window_kind, max(score)::double precision AS best,
           max(eligible_kills)::bigint AS eligible_kills,
           max(excluded_kills)::bigint AS excluded_kills,
           max(score) FILTER (WHERE position = excluded_kills + ((eligible_kills - excluded_kills - 1) / 4))::double precision AS floor_score,
           max(score) FILTER (WHERE position = excluded_kills + ((eligible_kills - excluded_kills - 1) / 2))::double precision AS form_score
    FROM classified
    GROUP BY realm_id, player_guid, instance_name, encounter_name, difficulty_name,
             max_players, player_class, player_spec, player_sub_spec, performance_metric, window_kind
)
SELECT k.realm_id, k.player_guid, k.instance_name, k.encounter_name,
       k.difficulty_name, k.max_players, k.player_class, k.player_spec,
       k.player_sub_spec, k.performance_metric, w.window_kind,
       w.stored_start AS window_start, w.stored_end AS window_end,
       COALESCE(c.eligible_kills, 0)::bigint AS eligible_kills,
       COALESCE(c.excluded_kills, 0)::bigint AS excluded_kills,
       c.best, c.floor_score, c.form_score
FROM keys k
CROSS JOIN windows w
LEFT JOIN summary c
  ON c.realm_id = k.realm_id AND c.player_guid = k.player_guid
 AND c.instance_name = k.instance_name AND c.encounter_name = k.encounter_name
 AND c.difficulty_name = k.difficulty_name AND c.max_players = k.max_players
 AND c.player_class = k.player_class AND c.player_spec = k.player_spec
 AND c.player_sub_spec = k.player_sub_spec AND c.performance_metric = k.performance_metric
 AND c.window_kind = w.window_kind
ORDER BY k.realm_id, k.player_guid, k.instance_name, k.encounter_name,
         k.difficulty_name, k.max_players, k.player_class, k.player_spec,
         k.player_sub_spec, k.performance_metric, w.window_kind;

-- name: CalculateTenantGuildMasteryPage :many
WITH keys AS MATERIALIZED (
    SELECT DISTINCT stage.realm_id, stage.guild_id, stage.instance_name, stage.encounter_name,
           stage.difficulty_name, stage.max_players
    FROM rating_stage_guild_observations stage
    WHERE stage.generation_id = @generation_id AND stage.tenant_id = @tenant_id
      AND stage.locked_parse BETWEEN 0 AND 100 AND stage.killed_at < @as_of::timestamptz
      AND stage.guild_id IS NOT NULL
      AND (stage.realm_id, stage.guild_id, stage.instance_name, stage.encounter_name,
           stage.difficulty_name, stage.max_players) >
          (@after_realm_id::uuid, @after_guild_id::uuid, @after_instance_name::text,
           @after_encounter_name::text, @after_difficulty_name::text, @after_max_players::smallint)
    ORDER BY stage.realm_id, stage.guild_id, stage.instance_name, stage.encounter_name,
             stage.difficulty_name, stage.max_players
    LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
), windows AS (
    SELECT 'all_time'::text AS window_kind, @all_time_start::timestamptz AS window_start,
           NULL::timestamptz AS stored_start, NULL::timestamptz AS stored_end
    UNION ALL
    SELECT 'period'::text, @period_start::timestamptz, @period_start::timestamptz, @as_of::timestamptz
), ordered AS MATERIALIZED (
    SELECT k.*, w.window_kind,
           stage.locked_parse::double precision AS score,
           (row_number() OVER (
               PARTITION BY k.realm_id, k.guild_id, k.instance_name, k.encounter_name,
                            k.difficulty_name, k.max_players, w.window_kind
               ORDER BY stage.locked_parse, stage.killed_at, stage.run_id
           ) - 1)::bigint AS position,
           count(*) OVER (
               PARTITION BY k.realm_id, k.guild_id, k.instance_name, k.encounter_name,
                            k.difficulty_name, k.max_players, w.window_kind
           )::bigint AS eligible_kills
    FROM keys k
    CROSS JOIN windows w
    JOIN rating_stage_guild_observations stage
      ON stage.generation_id = @generation_id AND stage.tenant_id = @tenant_id
     AND stage.realm_id = k.realm_id AND stage.guild_id = k.guild_id
     AND stage.instance_name = k.instance_name AND stage.encounter_name = k.encounter_name
     AND stage.difficulty_name = k.difficulty_name AND stage.max_players = k.max_players
     AND stage.locked_parse BETWEEN 0 AND 100
     AND stage.killed_at >= w.window_start AND stage.killed_at < @as_of::timestamptz
), classified AS MATERIALIZED (
    SELECT ordered.*,
           CASE WHEN eligible_kills >= 5 THEN eligible_kills / 5 ELSE 0 END AS excluded_kills
    FROM ordered
), summary AS MATERIALIZED (
    SELECT realm_id, guild_id, instance_name, encounter_name, difficulty_name,
           max_players, window_kind, max(score)::double precision AS best,
           max(eligible_kills)::bigint AS eligible_kills,
           max(excluded_kills)::bigint AS excluded_kills,
           max(score) FILTER (WHERE position = excluded_kills + ((eligible_kills - excluded_kills - 1) / 4))::double precision AS floor_score,
           max(score) FILTER (WHERE position = excluded_kills + ((eligible_kills - excluded_kills - 1) / 2))::double precision AS form_score
    FROM classified
    GROUP BY realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players, window_kind
)
SELECT k.realm_id, k.guild_id, k.instance_name, k.encounter_name,
       k.difficulty_name, k.max_players, w.window_kind,
       w.stored_start AS window_start, w.stored_end AS window_end,
       COALESCE(c.eligible_kills, 0)::bigint AS eligible_kills,
       COALESCE(c.excluded_kills, 0)::bigint AS excluded_kills,
       c.best, c.floor_score, c.form_score
FROM keys k
CROSS JOIN windows w
LEFT JOIN summary c
  ON c.realm_id = k.realm_id AND c.guild_id = k.guild_id
 AND c.instance_name = k.instance_name AND c.encounter_name = k.encounter_name
 AND c.difficulty_name = k.difficulty_name AND c.max_players = k.max_players
 AND c.window_kind = w.window_kind
ORDER BY k.realm_id, k.guild_id, k.instance_name, k.encounter_name,
         k.difficulty_name, k.max_players, w.window_kind;

-- name: UpsertCompletedRatingMasteryAccumulator :batchone
INSERT INTO rating_mastery_accumulators (
    generation_id, tenant_id, subject_kind, realm_id, subject_id, instance_name,
    encounter_name, difficulty_name, max_players, player_class, player_spec,
    player_sub_spec, performance_metric, window_kind, pass, eligible_kills,
    excluded_kills, best, floor_score, form_score
)
SELECT generation.id, generation.tenant_id, @subject_kind, @realm_id, @subject_id,
       @instance_name, @encounter_name, @difficulty_name, @max_players,
       @player_class, @player_spec, @player_sub_spec, @performance_metric,
       @window_kind, 'complete', @eligible_kills, @excluded_kills, @best,
       @floor_score, @form_score
FROM rating_score_generations generation
WHERE generation.id = @generation_id AND generation.tenant_id = @tenant_id
  AND generation.status = 'building'
FOR SHARE OF generation
ON CONFLICT (generation_id, subject_kind, realm_id, subject_id, instance_name,
             encounter_name, difficulty_name, max_players, player_class,
             player_spec, player_sub_spec, performance_metric, window_kind)
DO UPDATE SET pass = 'complete', version = rating_mastery_accumulators.version + 1,
              cursor_score = NULL, cursor_killed_at = NULL, cursor_run_id = NULL,
              position = 0, eligible_kills = EXCLUDED.eligible_kills,
              excluded_kills = EXCLUDED.excluded_kills, best = EXCLUDED.best,
              latest_retained_at = NULL, total_weight = 0, cumulative_weight = 0,
              floor_score = EXCLUDED.floor_score, form_score = EXCLUDED.form_score,
              last_retained_score = NULL
RETURNING 1;
