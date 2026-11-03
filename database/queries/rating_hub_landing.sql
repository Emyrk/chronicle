-- name: HubLandingRatingRows :many
-- Only the same 64 published cohorts returned by HubSummaryInstances are eligible.
-- Renown is instance-wide; its published period score is repeated for each cohort.
WITH cohorts AS (
  SELECT instance_name, difficulty_name, max_players
  FROM rankings_instance_summaries ris WHERE ris.tenant_id = @tenant_id
  ORDER BY instance_name, difficulty_name, max_players LIMIT 64
), scores AS (
  SELECT c.instance_name, c.difficulty_name, c.max_players,
    'player'::text AS subject, s.rating_metric, s.realm_id, s.player_guid::text AS subject_id,
    s.score, s.best_raw, s.player_class, s.player_spec, s.player_sub_spec,
    COALESCE(gp.name, '')::text AS subject_name, realm.name::text AS realm_name
  FROM cohorts c
  JOIN player_tenant_rating_scope_scores s ON s.tenant_id = @tenant_id AND s.generation_id = @generation_id
    AND s.instance_name = c.instance_name AND s.window_kind = 'period'
    AND ((s.rating_metric IN ('peak', 'ranked_mastery') AND s.performance_metric = 'dps'
      AND s.difficulty_name = c.difficulty_name AND s.max_players = c.max_players)
      OR (s.rating_metric = 'renown' AND s.performance_metric = 'none'
      AND s.difficulty_name = '' AND s.max_players = 0))
  JOIN wow_server_realms realm ON realm.id = s.realm_id
    AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR realm.id = ANY(@realm_ids::uuid[]))
  JOIN wow_servers server ON server.id = realm.server_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  LEFT JOIN game_players gp ON gp.realm_id = s.realm_id
    AND gp.id = (CASE WHEN s.player_guid ~ '^0x[0-9A-Fa-f]{16}$' THEN s.player_guid::wow_guid ELSE NULL::wow_guid END)
  UNION ALL
  SELECT c.instance_name, c.difficulty_name, c.max_players,
    'guild'::text, s.rating_metric, s.realm_id, s.guild_id::text,
    s.score, NULL::float8, ''::text, ''::text, ''::text,
    COALESCE(g.name, '')::text, realm.name::text
  FROM cohorts c
  JOIN guild_tenant_rating_scope_scores s ON s.tenant_id = @tenant_id AND s.generation_id = @generation_id
    AND s.instance_name = c.instance_name AND s.rating_metric = 'renown'
    AND s.window_kind = 'period' AND s.difficulty_name = '' AND s.max_players = 0
  JOIN wow_server_realms realm ON realm.id = s.realm_id
    AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR realm.id = ANY(@realm_ids::uuid[]))
  JOIN wow_servers server ON server.id = realm.server_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  JOIN guilds g ON g.id = s.guild_id AND g.realm_id = s.realm_id
), unique_subjects AS (
  SELECT *, row_number() OVER (PARTITION BY instance_name, difficulty_name, max_players, subject, rating_metric, realm_id, subject_id
    ORDER BY score DESC, COALESCE(best_raw, 0) DESC, player_class, player_spec, player_sub_spec) AS identity_position FROM scores
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY instance_name, difficulty_name, max_players, subject, rating_metric
    ORDER BY score DESC, (CASE WHEN rating_metric = 'peak' THEN COALESCE(best_raw, 0) ELSE 0 END) DESC, realm_id, subject_id) AS position
  FROM unique_subjects WHERE identity_position = 1
)
SELECT instance_name, difficulty_name, max_players, subject, rating_metric, realm_id,
  subject_id, score,
  -- Raid Peak's throughput (0 when unknown): total output over total fight time.
  COALESCE(CASE WHEN subject = 'player' AND rating_metric = 'peak' THEN best_raw END, 0)::float8 AS peak_raw,
  player_class, player_spec, player_sub_spec, subject_name, realm_name
FROM ranked WHERE position <= 3
  AND EXISTS (SELECT 1 FROM rating_score_generations generation
    WHERE generation.id = @generation_id AND generation.tenant_id = @tenant_id AND generation.status = 'active')
ORDER BY instance_name, difficulty_name, max_players, subject, rating_metric, position;

-- name: HubLandingSpeedruns :many
-- Mirrors the full-clear leaderboard: version gates, duplicate groups, best
-- per guild, ranked duration with legacy raw fallback. Do not load video proof.
WITH cohorts AS (
  SELECT instance_name, difficulty_name, max_players
  FROM rankings_instance_summaries ris WHERE ris.tenant_id = @tenant_id
  ORDER BY instance_name, difficulty_name, max_players LIMIT 64
), eligible AS (
  SELECT c.instance_name, c.difficulty_name, c.max_players,
    sr.instance_id, sr.guild_id, sr.addon_version, li.hashed_slug, li.duplicate_group_id,
    li.parser_version, COALESCE(sr.ranked_duration_ms, sr.duration_ms)::bigint AS duration_ms,
    COALESCE(sr.ranked_start_time, sr.start_time)::timestamptz AS start_time,
    COALESCE(sr.ranked_completion_time, sr.completion_time)::timestamptz AS completion_time,
    g.name::text AS guild_name, realm.name::text AS realm_name,
    COALESCE(gp.theme->>'logo_url', '')::text AS guild_logo_url
  FROM cohorts c
  JOIN instance_speedruns sr ON sr.instance_name = c.instance_name AND sr.qualified AND sr.guild_id IS NOT NULL
  JOIN log_instances li ON li.id = sr.instance_id AND li.difficulty_name = c.difficulty_name AND li.max_players = c.max_players
  JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
  JOIN wow_server_realms realm ON realm.id = sr.realm_id AND realm.id = li.realm_id
    AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR realm.id = ANY(@realm_ids::uuid[]))
  JOIN wow_servers server ON server.id = realm.server_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  JOIN guilds g ON g.id = sr.guild_id AND g.realm_id = sr.realm_id
  LEFT JOIN guild_pages gp ON gp.guild_id = sr.guild_id
  LEFT JOIN leaderboard_version_requirements lvr ON lvr.instance_name = sr.instance_name
  WHERE sr.parser_version_num >= COALESCE(lvr.min_parser_version_num, 0)
    AND sr.addon_version_num >= COALESCE(lvr.min_addon_version_num, 0)
), deduped AS (
  SELECT *, row_number() OVER (PARTITION BY instance_name, difficulty_name, max_players, COALESCE(duplicate_group_id, instance_id)
    ORDER BY duration_ms, instance_id) AS duplicate_position FROM eligible
), best_guild AS (
  SELECT *, row_number() OVER (PARTITION BY instance_name, difficulty_name, max_players, guild_id
    ORDER BY duration_ms, instance_id) AS guild_position FROM deduped WHERE duplicate_position = 1
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY instance_name, difficulty_name, max_players
    ORDER BY duration_ms, instance_id) AS position FROM best_guild WHERE guild_position = 1
)
SELECT instance_name, difficulty_name, max_players, instance_id, guild_id, addon_version,
  hashed_slug, duplicate_group_id, parser_version, duration_ms, start_time, completion_time,
  guild_name, realm_name, guild_logo_url,
  (SELECT COUNT(*) FROM log_instance_players lip WHERE lip.instance_id = ranked.instance_id)::bigint AS player_count
FROM ranked WHERE position <= 3
ORDER BY instance_name, difficulty_name, max_players, position;
