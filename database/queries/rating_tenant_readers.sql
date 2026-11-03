-- Published tenant-wide projection readers. realm_ids is display-only;
-- an empty array shows every realm owned by the tenant.
-- Pass zero generation_id and zero after_realm_id on the first page. Continue
-- with the returned generation_id and the last row's (score, realm_id,
-- player_guid/guild_id). Retired generations can be deleted with CASCADE, so
-- continuation is active-only: callers must compare the cursor generation
-- with the active tenant generation and report stale cursor on mismatch.
-- Never restart at a new generation using an old position.

-- name: GetActiveTenantRatingGeneration :one
-- Compare this ID with a continuation cursor before reading; a mismatch or
-- no active generation means the cursor is stale, not an empty leaderboard.
SELECT id FROM rating_score_generations
WHERE tenant_id = @tenant_id AND status = 'active';

-- name: GetPublishedPlayerBossFullList :one
-- Rank the full tenant cohort before applying display-only realm/name filters.
-- A single statement computes the page and count from the same MVCC snapshot.
WITH best AS (
  SELECT DISTINCT ON (rated.realm_id, rated.player_guid) rated.*, to_jsonb(rated) AS payload
  FROM player_tenant_rating_boss_scores rated
  JOIN rating_score_generations generation ON generation.id = rated.generation_id
    AND generation.tenant_id = rated.tenant_id AND generation.status = 'active'
  JOIN wow_server_realms realm ON realm.id = rated.realm_id
  JOIN wow_servers server ON server.id = realm.server_id
  WHERE rated.tenant_id = @tenant_id AND rated.generation_id = @generation_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND rated.instance_name = @instance_name
    AND rated.encounter_name = @encounter_name
    AND rated.difficulty_name = @difficulty_name AND rated.max_players = @max_players
    AND (@player_class::text = '' OR rated.player_class = @player_class)
    AND (@player_spec::text = '' OR rated.player_spec = @player_spec)
    AND (@player_sub_spec::text = '' OR rated.player_sub_spec = @player_sub_spec)
    AND rated.performance_metric = @performance_metric
    AND rated.rating_metric = @rating_metric AND rated.window_kind = @window_kind
  ORDER BY rated.realm_id, rated.player_guid, rated.score DESC, rated.player_class, rated.player_spec, rated.player_sub_spec
),
ranked AS (
  SELECT best.*, row_number() OVER (ORDER BY score DESC, realm_id, player_guid) AS global_rank
  FROM best
),
displayed AS (
  SELECT ranked.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
  FROM ranked
  JOIN wow_server_realms realm ON realm.id = ranked.realm_id
  LEFT JOIN game_players gp ON gp.realm_id = ranked.realm_id AND gp.id =
    (CASE WHEN ranked.player_guid ~ '^0x[0-9A-Fa-f]{16}$' THEN ranked.player_guid::wow_guid ELSE NULL::wow_guid END)
  LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = ranked.realm_id
  WHERE (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR ranked.realm_id = ANY(@realm_ids::uuid[]))
    AND (@search_query::text = '' OR position(lower(@search_query::text) in lower(COALESCE(gp.name, ranked.player_guid))) > 0
         OR position(lower(@search_query::text) in lower(COALESCE(guild.name, ''))) > 0)
),
paged AS (
  SELECT displayed.*, scores.peak, scores.mastery, scores.renown
  FROM displayed
  LEFT JOIN LATERAL (
    SELECT max(s.score) FILTER (WHERE s.rating_metric = 'peak' AND s.window_kind = @other_window_kind::text) AS peak,
           max(s.score) FILTER (WHERE s.rating_metric = 'ranked_mastery' AND s.window_kind = @other_window_kind::text) AS mastery,
           max(s.score) FILTER (WHERE s.rating_metric = 'renown' AND s.window_kind = @renown_window_kind::text) AS renown
    FROM player_tenant_rating_boss_scores s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name AND s.encounter_name = @encounter_name
      AND s.realm_id = displayed.realm_id AND s.player_guid = displayed.player_guid
      AND ((s.rating_metric IN ('peak', 'ranked_mastery')
            AND s.difficulty_name = @other_difficulty_name AND s.max_players = @other_max_players
            AND s.performance_metric = @other_performance_metric
            AND (@player_class::text = '' OR s.player_class = @player_class)
            AND (@player_spec::text = '' OR s.player_spec = @player_spec)
            AND (@player_sub_spec::text = '' OR s.player_sub_spec = @player_sub_spec))
           OR (s.rating_metric = 'renown' AND s.difficulty_name = ''
               AND s.max_players = 0 AND s.performance_metric = 'none'))
  ) scores ON true
  ORDER BY displayed.global_rank
  LIMIT @limit_count::int OFFSET @offset_count::int
)
SELECT (SELECT count(*) FROM displayed)::bigint AS total,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'rank', global_rank,
         'entry', payload || jsonb_build_object('player_name', player_name, 'guild_name', guild_name, 'realm_name', realm_name),
         'scores', jsonb_build_object('peak', peak, 'mastery', mastery, 'renown', renown)
       ) ORDER BY global_rank) FROM paged), '[]'::jsonb) AS rows;


-- name: GetPublishedPlayerScopeFullList :one
-- Rank the full tenant cohort before applying display-only realm/name filters.
-- A single statement computes the page and count from the same MVCC snapshot.
WITH best AS (
  SELECT DISTINCT ON (rated.realm_id, rated.player_guid) rated.*, to_jsonb(rated) AS payload
  FROM player_tenant_rating_scope_scores rated
  JOIN rating_score_generations generation ON generation.id = rated.generation_id
    AND generation.tenant_id = rated.tenant_id AND generation.status = 'active'
  JOIN wow_server_realms realm ON realm.id = rated.realm_id
  JOIN wow_servers server ON server.id = realm.server_id
  WHERE rated.tenant_id = @tenant_id AND rated.generation_id = @generation_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND rated.instance_name = @instance_name
    AND rated.difficulty_name = @difficulty_name AND rated.max_players = @max_players
    AND (@player_class::text = '' OR rated.player_class = @player_class)
    AND (@player_spec::text = '' OR rated.player_spec = @player_spec)
    AND (@player_sub_spec::text = '' OR rated.player_sub_spec = @player_sub_spec)
    AND rated.performance_metric = @performance_metric
    AND rated.rating_metric = @rating_metric AND rated.window_kind = @window_kind
  ORDER BY rated.realm_id, rated.player_guid, rated.score DESC, rated.player_class, rated.player_spec, rated.player_sub_spec
),
ranked AS (
  SELECT best.*, row_number() OVER (ORDER BY score DESC, realm_id, player_guid) AS global_rank
  FROM best
),
displayed AS (
  SELECT ranked.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
  FROM ranked
  JOIN wow_server_realms realm ON realm.id = ranked.realm_id
  LEFT JOIN game_players gp ON gp.realm_id = ranked.realm_id AND gp.id =
    (CASE WHEN ranked.player_guid ~ '^0x[0-9A-Fa-f]{16}$' THEN ranked.player_guid::wow_guid ELSE NULL::wow_guid END)
  LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = ranked.realm_id
  WHERE (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR ranked.realm_id = ANY(@realm_ids::uuid[]))
    AND (@search_query::text = '' OR position(lower(@search_query::text) in lower(COALESCE(gp.name, ranked.player_guid))) > 0
         OR position(lower(@search_query::text) in lower(COALESCE(guild.name, ''))) > 0)
),
paged AS (
  SELECT displayed.*, scores.peak, scores.mastery, scores.renown
  FROM displayed
  LEFT JOIN LATERAL (
    SELECT max(s.score) FILTER (WHERE s.rating_metric = 'peak' AND s.window_kind = @other_window_kind::text) AS peak,
           max(s.score) FILTER (WHERE s.rating_metric = 'ranked_mastery' AND s.window_kind = @other_window_kind::text) AS mastery,
           max(s.score) FILTER (WHERE s.rating_metric = 'renown' AND s.window_kind = @renown_window_kind::text) AS renown
    FROM player_tenant_rating_scope_scores s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
      AND s.realm_id = displayed.realm_id AND s.player_guid = displayed.player_guid
      AND ((s.rating_metric IN ('peak', 'ranked_mastery')
            AND s.difficulty_name = @other_difficulty_name AND s.max_players = @other_max_players
            AND s.performance_metric = @other_performance_metric
            AND (@player_class::text = '' OR s.player_class = @player_class)
            AND (@player_spec::text = '' OR s.player_spec = @player_spec)
            AND (@player_sub_spec::text = '' OR s.player_sub_spec = @player_sub_spec))
           OR (s.rating_metric = 'renown' AND s.difficulty_name = ''
               AND s.max_players = 0 AND s.performance_metric = 'none'))
  ) scores ON true
  ORDER BY displayed.global_rank
  LIMIT @limit_count::int OFFSET @offset_count::int
)
SELECT (SELECT count(*) FROM displayed)::bigint AS total,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'rank', global_rank,
         'entry', payload || jsonb_build_object('player_name', player_name, 'guild_name', guild_name, 'realm_name', realm_name),
         'scores', jsonb_build_object('peak', peak, 'mastery', mastery, 'renown', renown)
       ) ORDER BY global_rank) FROM paged), '[]'::jsonb) AS rows;

-- name: ListActivePlayerTenantBossScores :many
SELECT score.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
FROM player_tenant_rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
-- Keep the indexed wow_guid column uncast. Non-GUID historical score text
-- must safely miss the optional identity join rather than fail the board.
LEFT JOIN game_players gp ON gp.realm_id = score.realm_id AND gp.id = (CASE WHEN score.player_guid ~ '^0x[0-9A-Fa-f]{16}$'
     THEN score.player_guid::wow_guid ELSE NULL::wow_guid END)
LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.player_class = @player_class
  AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
  AND score.performance_metric = @performance_metric
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.player_guid > @after_player_guid::text))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActivePlayerTenantScopeScores :many
SELECT score.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
FROM player_tenant_rating_scope_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
LEFT JOIN game_players gp ON gp.realm_id = score.realm_id AND gp.id = (CASE WHEN score.player_guid ~ '^0x[0-9A-Fa-f]{16}$'
     THEN score.player_guid::wow_guid ELSE NULL::wow_guid END)
LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.player_class = @player_class
  AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
  AND score.performance_metric = @performance_metric
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.player_guid > @after_player_guid::text))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveAllClassPlayerTenantBossScores :many
WITH best AS (
  SELECT DISTINCT ON (score.realm_id, score.player_guid) score.*
  FROM player_tenant_rating_boss_scores score
  JOIN rating_score_generations generation
    ON generation.id = score.generation_id AND generation.tenant_id = score.tenant_id AND generation.status = 'active'
  JOIN wow_server_realms realm ON realm.id = score.realm_id
  JOIN wow_servers server ON server.id = realm.server_id
  WHERE score.tenant_id = @tenant_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND score.generation_id = @generation_id
    AND score.instance_name = @instance_name
    AND score.encounter_name = @encounter_name
    AND score.difficulty_name = @difficulty_name
    AND score.max_players = @max_players
    AND (@player_class::text = '' OR score.player_class = @player_class)
    AND (@player_spec::text = '' OR score.player_spec = @player_spec)
    AND (@player_sub_spec::text = '' OR score.player_sub_spec = @player_sub_spec)
    AND score.performance_metric = @performance_metric
    AND score.rating_metric = @rating_metric
    AND score.window_kind = @window_kind
    AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  ORDER BY score.realm_id, score.player_guid, score.score DESC, score.player_class, score.player_spec, score.player_sub_spec
)
SELECT score.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
FROM best score
JOIN wow_server_realms realm ON realm.id = score.realm_id
LEFT JOIN game_players gp ON gp.realm_id = score.realm_id AND gp.id = (CASE WHEN score.player_guid ~ '^0x[0-9A-Fa-f]{16}$'
     THEN score.player_guid::wow_guid ELSE NULL::wow_guid END)
LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = score.realm_id
WHERE (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.player_guid > @after_player_guid::text))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveAllClassPlayerTenantScopeScores :many
WITH best AS (
  SELECT DISTINCT ON (score.realm_id, score.player_guid) score.*
  FROM player_tenant_rating_scope_scores score
  JOIN rating_score_generations generation
    ON generation.id = score.generation_id AND generation.tenant_id = score.tenant_id AND generation.status = 'active'
  JOIN wow_server_realms realm ON realm.id = score.realm_id
  JOIN wow_servers server ON server.id = realm.server_id
  WHERE score.tenant_id = @tenant_id
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND score.generation_id = @generation_id
    AND score.instance_name = @instance_name
    AND score.difficulty_name = @difficulty_name
    AND score.max_players = @max_players
    AND (@player_class::text = '' OR score.player_class = @player_class)
    AND (@player_spec::text = '' OR score.player_spec = @player_spec)
    AND (@player_sub_spec::text = '' OR score.player_sub_spec = @player_sub_spec)
    AND score.performance_metric = @performance_metric
    AND score.rating_metric = @rating_metric
    AND score.window_kind = @window_kind
    AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  ORDER BY score.realm_id, score.player_guid, score.score DESC, score.player_class, score.player_spec, score.player_sub_spec
)
SELECT score.*, gp.name AS player_name, guild.name AS guild_name, realm.name AS realm_name
FROM best score
JOIN wow_server_realms realm ON realm.id = score.realm_id
LEFT JOIN game_players gp ON gp.realm_id = score.realm_id AND gp.id = (CASE WHEN score.player_guid ~ '^0x[0-9A-Fa-f]{16}$'
     THEN score.player_guid::wow_guid ELSE NULL::wow_guid END)
LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = score.realm_id
WHERE (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.player_guid > @after_player_guid::text))
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveGuildTenantBossScores :many
SELECT score.*, guild.name AS guild_name, realm.name AS realm_name
FROM guild_tenant_rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
LEFT JOIN guilds guild ON guild.id = score.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.guild_id > @after_guild_id::uuid))
ORDER BY score.score DESC, score.realm_id, score.guild_id
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);

-- name: ListActiveGuildTenantScopeScores :many
SELECT score.*, guild.name AS guild_name, realm.name AS realm_name
FROM guild_tenant_rating_scope_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN wow_server_realms realm ON realm.id = score.realm_id
JOIN wow_servers server ON server.id = realm.server_id
LEFT JOIN guilds guild ON guild.id = score.guild_id AND guild.realm_id = score.realm_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND (@generation_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR score.generation_id = @generation_id::uuid)
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR @generation_id::uuid <> '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.instance_name = @instance_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
  AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR score.realm_id = ANY(@realm_ids::uuid[]))
  AND score.score <= CASE WHEN @after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
                          THEN 'Infinity'::float8 ELSE @after_score::float8 END
  AND (@after_realm_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid
       OR score.score < @after_score::float8
       OR (score.score = @after_score::float8 AND score.realm_id > @after_realm_id::uuid)
       OR (score.score = @after_score::float8 AND score.realm_id = @after_realm_id::uuid AND score.guild_id > @after_guild_id::uuid))
ORDER BY score.score DESC, score.realm_id, score.guild_id
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);
