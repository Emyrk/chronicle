-- Generation-free readers against the evolving projection compatibility views.

-- name: GetEvolvingGuildBossFullList :one
-- Rank the full tenant guild cohort before applying display-only realm/name filters.
-- A single statement computes the page and count from the same MVCC snapshot.
WITH best AS (
  SELECT DISTINCT ON (rated.realm_id, rated.guild_id) rated.*, to_jsonb(rated) AS payload
  FROM guild_tenant_rating_boss_scores_evolving_read rated

  JOIN wow_server_realms realm ON realm.id = rated.realm_id
  JOIN wow_servers server ON server.id = realm.server_id
  WHERE rated.tenant_id = @tenant_id AND rated.generation_id = @generation_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND rated.instance_name = @instance_name
    AND rated.encounter_name = @encounter_name
    AND rated.difficulty_name = @difficulty_name AND rated.max_players = @max_players
    AND rated.rating_metric = @rating_metric AND rated.window_kind = @window_kind
  ORDER BY rated.realm_id, rated.guild_id, rated.score DESC
),
ranked AS (
  SELECT best.*, row_number() OVER (ORDER BY score DESC, realm_id, guild_id) AS global_rank
  FROM best
),
displayed AS (
  SELECT ranked.*, guild.name AS guild_name, realm.name AS realm_name
  FROM ranked
  JOIN wow_server_realms realm ON realm.id = ranked.realm_id
  LEFT JOIN guilds guild ON guild.id = ranked.guild_id AND guild.realm_id = ranked.realm_id
  WHERE (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR ranked.realm_id = ANY(@realm_ids::uuid[]))
    AND (@search_query::text = '' OR position(lower(@search_query::text) in lower(COALESCE(guild.name, ranked.guild_id::text))) > 0)
),
paged AS (
  SELECT displayed.*, scores.peak, scores.mastery, scores.renown
  FROM displayed
  LEFT JOIN LATERAL (
    SELECT max(s.score) FILTER (WHERE s.rating_metric = 'peak' AND s.window_kind = @other_window_kind::text) AS peak,
           max(s.score) FILTER (WHERE s.rating_metric = 'mastery' AND s.window_kind = @other_window_kind::text) AS mastery,
           max(s.score) FILTER (WHERE s.rating_metric = 'renown' AND s.window_kind = @renown_window_kind::text) AS renown
    FROM guild_tenant_rating_boss_scores_evolving_read s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name AND s.encounter_name = @encounter_name
      AND s.realm_id = displayed.realm_id AND s.guild_id = displayed.guild_id
      AND ((s.rating_metric IN ('peak', 'mastery')
            AND s.difficulty_name = @other_difficulty_name AND s.max_players = @other_max_players)
           OR (s.rating_metric = 'renown' AND s.difficulty_name = ''
               AND s.max_players = 0))
  ) scores ON true
  ORDER BY displayed.global_rank
  LIMIT @limit_count::int OFFSET @offset_count::int
)
SELECT (SELECT count(*) FROM displayed)::bigint AS total,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'rank', global_rank,
         'entry', payload || jsonb_build_object('guild_name', guild_name, 'realm_name', realm_name),
         'scores', jsonb_build_object('peak', peak, 'mastery', mastery, 'renown', renown)
       ) ORDER BY global_rank) FROM paged), '[]'::jsonb) AS rows;


-- name: GetEvolvingGuildScopeFullList :one
-- Rank the full tenant guild cohort before applying display-only realm/name filters.
-- A single statement computes the page and count from the same MVCC snapshot.
WITH best AS (
  SELECT DISTINCT ON (rated.realm_id, rated.guild_id) rated.*, to_jsonb(rated) AS payload
  FROM guild_tenant_rating_scope_scores_evolving_read rated

  JOIN wow_server_realms realm ON realm.id = rated.realm_id
  JOIN wow_servers server ON server.id = realm.server_id
  WHERE rated.tenant_id = @tenant_id AND rated.generation_id = @generation_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND rated.instance_name = @instance_name
    AND rated.difficulty_name = @difficulty_name AND rated.max_players = @max_players
    AND rated.rating_metric = @rating_metric AND rated.window_kind = @window_kind
  ORDER BY rated.realm_id, rated.guild_id, rated.score DESC
),
ranked AS (
  SELECT best.*, row_number() OVER (ORDER BY score DESC, realm_id, guild_id) AS global_rank
  FROM best
),
displayed AS (
  SELECT ranked.*, guild.name AS guild_name, realm.name AS realm_name
  FROM ranked
  JOIN wow_server_realms realm ON realm.id = ranked.realm_id
  LEFT JOIN guilds guild ON guild.id = ranked.guild_id AND guild.realm_id = ranked.realm_id
  WHERE (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR ranked.realm_id = ANY(@realm_ids::uuid[]))
    AND (@search_query::text = '' OR position(lower(@search_query::text) in lower(COALESCE(guild.name, ranked.guild_id::text))) > 0)
),
paged AS (
  SELECT displayed.*, scores.peak, scores.mastery, scores.renown
  FROM displayed
  LEFT JOIN LATERAL (
    SELECT max(s.score) FILTER (WHERE s.rating_metric = 'peak' AND s.window_kind = @other_window_kind::text) AS peak,
           max(s.score) FILTER (WHERE s.rating_metric = 'mastery' AND s.window_kind = @other_window_kind::text) AS mastery,
           max(s.score) FILTER (WHERE s.rating_metric = 'renown' AND s.window_kind = @renown_window_kind::text) AS renown
    FROM guild_tenant_rating_scope_scores_evolving_read s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
      AND s.realm_id = displayed.realm_id AND s.guild_id = displayed.guild_id
      AND ((s.rating_metric IN ('peak', 'mastery')
            AND s.difficulty_name = @other_difficulty_name AND s.max_players = @other_max_players)
           OR (s.rating_metric = 'renown' AND s.difficulty_name = ''
               AND s.max_players = 0))
  ) scores ON true
  ORDER BY displayed.global_rank
  LIMIT @limit_count::int OFFSET @offset_count::int
)
SELECT (SELECT count(*) FROM displayed)::bigint AS total,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'rank', global_rank,
         'entry', payload || jsonb_build_object('guild_name', guild_name, 'realm_name', realm_name),
         'scores', jsonb_build_object('peak', peak, 'mastery', mastery, 'renown', renown)
       ) ORDER BY global_rank) FROM paged), '[]'::jsonb) AS rows;
