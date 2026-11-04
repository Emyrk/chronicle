-- Generation-free readers against the evolving projection compatibility views.

-- name: EvolvingHubLandingRatingRows :many
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
  JOIN player_tenant_rating_scope_scores_evolving_read s ON s.tenant_id = @tenant_id AND s.generation_id = @generation_id
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
  JOIN guild_tenant_rating_scope_scores_evolving_read s ON s.tenant_id = @tenant_id AND s.generation_id = @generation_id
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

ORDER BY instance_name, difficulty_name, max_players, subject, rating_metric, position;
