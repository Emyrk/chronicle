-- Aggregate a single immutable subject, never retaining its history in Go.
-- name: RatingStagePlayerPeak :one
-- The best kill's throughput, and its fight length (0 when unknown) so raid
-- Peak can weigh bosses by duration. Ties prefer the earlier kill.
SELECT coalesce(max(raw_value), 0)::double precision AS career_raw,
       coalesce(max(raw_value) FILTER (WHERE killed_at >= @period_start), 0)::double precision AS period_raw,
       coalesce((array_agg(duration_secs ORDER BY raw_value DESC, killed_at))[1], 0)::double precision AS career_duration_secs,
       coalesce((array_agg(duration_secs ORDER BY raw_value DESC, killed_at) FILTER (WHERE killed_at >= @period_start))[1], 0)::double precision AS period_duration_secs
FROM rating_stage_player_observations
WHERE generation_id = @generation_id AND realm_id = @realm_id AND player_guid = @player_guid
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND killed_at < @window_end;

-- name: RatingStageGuildPeak :one
SELECT coalesce(min(raw_duration_ms), 0)::double precision AS career_raw,
       coalesce(min(raw_duration_ms) FILTER (WHERE killed_at >= @period_start), 0)::double precision AS period_raw
FROM rating_stage_guild_observations
WHERE generation_id = @generation_id AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND killed_at < @window_end;

-- name: RatingProjectionPlayerRankOne :one
SELECT coalesce(max(raw_value), 0)::double precision AS career_raw,
       coalesce(max(raw_value) FILTER (WHERE killed_at >= @period_start), 0)::double precision AS period_raw
FROM rating_stage_player_observations
WHERE generation_id = @generation_id AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND player_class = @player_class
  AND player_spec = @player_spec AND player_sub_spec = @player_sub_spec
  AND performance_metric = @performance_metric AND killed_at < @window_end;

-- name: RatingProjectionGuildRankOne :one
SELECT coalesce(min(raw_duration_ms), 0)::double precision AS career_raw,
       coalesce(min(raw_duration_ms) FILTER (WHERE killed_at >= @period_start), 0)::double precision AS period_raw
FROM rating_stage_guild_observations
WHERE generation_id = @generation_id AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND difficulty_name = @difficulty_name
  AND max_players = @max_players AND killed_at < @window_end;

-- name: RatingStagePlayerRenownTotals :one
SELECT count(*)::integer AS career_kills,
       count(*) FILTER (WHERE killed_at >= @period_start)::integer AS period_kills
FROM rating_stage_player_renown
WHERE generation_id = @generation_id AND realm_id = @realm_id AND player_guid = @player_guid
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND killed_at < @window_end;

-- name: RatingStageGuildRenownTotals :one
SELECT count(*)::integer AS career_kills,
       count(*) FILTER (WHERE killed_at >= @period_start)::integer AS period_kills
FROM rating_stage_guild_renown
WHERE generation_id = @generation_id AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND killed_at < @window_end;

-- A scope subject is a distinct character/cohort/rating/window. Each page is
-- bounded; the caller reads only that subject's configured boss rows.
-- name: ListRatingProjectionPlayerScopes :many
SELECT DISTINCT group_id, realm_id, player_guid, difficulty_name, max_players,
       player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind
FROM rating_boss_scores
WHERE generation_id = @generation_id AND group_id IS NOT NULL
  AND (group_id, realm_id, player_guid, difficulty_name, max_players,
       player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind) >
      (@after_group_id::uuid, @after_realm_id::uuid, @after_player_guid::text,
       @after_difficulty_name::text, @after_max_players::smallint, @after_player_class::text,
       @after_player_spec::text, @after_player_sub_spec::text, @after_performance_metric::text,
       @after_rating_metric::text, @after_window_kind::text)
ORDER BY group_id, realm_id, player_guid, difficulty_name, max_players,
         player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind
LIMIT LEAST(GREATEST(@batch_size::int, 0), 100);

-- name: ListRatingProjectionPlayerBosses :many
SELECT instance_name, encounter_name, score FROM rating_boss_scores
WHERE generation_id = @generation_id AND group_id = @group_id AND realm_id = @realm_id
  AND player_guid = @player_guid AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND player_class = @player_class AND player_spec = @player_spec
  AND player_sub_spec = @player_sub_spec AND performance_metric = @performance_metric
  AND rating_metric = @rating_metric AND window_kind = @window_kind
LIMIT 201;

-- name: ListRatingProjectionGuildScopes :many
SELECT DISTINCT group_id, realm_id, guild_id, difficulty_name, max_players, rating_metric, window_kind
FROM guild_rating_boss_scores WHERE generation_id = @generation_id
  AND (group_id, realm_id, guild_id, difficulty_name, max_players, rating_metric, window_kind) >
      (@after_group_id::uuid, @after_realm_id::uuid, @after_guild_id::uuid,
       @after_difficulty_name::text, @after_max_players::smallint,
       @after_rating_metric::text, @after_window_kind::text)
ORDER BY group_id, realm_id, guild_id, difficulty_name, max_players, rating_metric, window_kind
LIMIT LEAST(GREATEST(@batch_size::int, 0), 100);

-- name: ListRatingProjectionGuildBosses :many
SELECT instance_name, encounter_name, score FROM guild_rating_boss_scores
WHERE generation_id = @generation_id AND group_id = @group_id AND realm_id = @realm_id
  AND guild_id = @guild_id AND difficulty_name = @difficulty_name AND max_players = @max_players
  AND rating_metric = @rating_metric AND window_kind = @window_kind
LIMIT 201;
