-- name: HubSummaryRatingRows :many
-- All boards share the caller-pinned active generation. Bound boss names and
-- truncate each board in SQL, not in the HTTP handler.
WITH selected_bosses AS (
  SELECT names.encounter_name FROM (
    SELECT p.encounter_name FROM player_tenant_rating_boss_scores p
    WHERE p.tenant_id = @tenant_id AND p.generation_id = @generation_id AND p.instance_name = @instance_name
    UNION
    SELECT g.encounter_name FROM guild_tenant_rating_boss_scores g
    WHERE g.tenant_id = @tenant_id AND g.generation_id = @generation_id AND g.instance_name = @instance_name
  ) names ORDER BY (names.encounter_name <> @featured_encounter::text), names.encounter_name LIMIT 30
), boards AS (
  SELECT 'player'::text AS subject, 'scope'::text AS board, b.rating_metric, ''::text AS encounter_name,
         b.realm_id, b.player_guid::text AS subject_id, b.score, b.best_raw, b.player_class, b.player_spec, b.player_sub_spec,
         COALESCE(gp.name, '')::text AS subject_name, realm.name::text AS realm_name,
         row_number() OVER (PARTITION BY b.rating_metric ORDER BY b.score DESC, (CASE WHEN b.rating_metric = 'peak' THEN COALESCE(b.best_raw, 0) ELSE 0 END) DESC, b.realm_id, b.player_guid) AS position
  FROM (
    SELECT DISTINCT ON (s.rating_metric, s.realm_id, s.player_guid) s.*
    FROM player_tenant_rating_scope_scores s
    JOIN rating_score_generations generation ON generation.id = s.generation_id AND generation.tenant_id = s.tenant_id AND generation.status = 'active'
    JOIN wow_server_realms source_realm ON source_realm.id = s.realm_id
    JOIN wow_servers server ON server.id = source_realm.server_id
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
      AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR s.realm_id = ANY(@realm_ids::uuid[]))
      AND ((s.rating_metric = 'renown' AND s.window_kind = 'period' AND s.difficulty_name = '' AND s.max_players = 0 AND s.performance_metric = 'none') OR (s.rating_metric IN ('peak', 'ranked_mastery') AND s.window_kind = 'period' AND @exact_cohort::boolean AND s.difficulty_name = @difficulty_name AND s.max_players = @max_players AND s.performance_metric = sqlc.arg(performance_metric)::text))
    AND (s.rating_metric = 'renown' OR ((@player_class::text = '' OR s.player_class = @player_class) AND (@player_spec::text = '' OR s.player_spec = @player_spec) AND (@player_sub_spec::text = '' OR s.player_sub_spec = @player_sub_spec)))

    ORDER BY s.rating_metric, s.realm_id, s.player_guid, s.score DESC, COALESCE(s.best_raw, 0) DESC, s.player_class, s.player_spec, s.player_sub_spec
  ) b
  JOIN wow_server_realms realm ON realm.id = b.realm_id
  LEFT JOIN game_players gp ON gp.realm_id = b.realm_id AND gp.id = (CASE WHEN b.player_guid ~ '^0x[0-9A-Fa-f]{16}$' THEN b.player_guid::wow_guid ELSE NULL::wow_guid END)
  LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = b.realm_id
  UNION ALL
  SELECT 'player'::text AS subject, 'boss'::text AS board, b.rating_metric, b.encounter_name AS encounter_name,
         b.realm_id, b.player_guid::text AS subject_id, b.score, b.best_raw, b.player_class, b.player_spec, b.player_sub_spec,
         COALESCE(gp.name, '')::text AS subject_name, realm.name::text AS realm_name,
         row_number() OVER (PARTITION BY b.encounter_name, b.rating_metric ORDER BY b.score DESC, (CASE WHEN b.rating_metric = 'peak' THEN COALESCE(b.best_raw, 0) ELSE 0 END) DESC, b.realm_id, b.player_guid) AS position
  FROM (
    SELECT DISTINCT ON (s.encounter_name, s.rating_metric, s.realm_id, s.player_guid) s.*
    FROM player_tenant_rating_boss_scores s
    JOIN rating_score_generations generation ON generation.id = s.generation_id AND generation.tenant_id = s.tenant_id AND generation.status = 'active'
    JOIN wow_server_realms source_realm ON source_realm.id = s.realm_id
    JOIN wow_servers server ON server.id = source_realm.server_id
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
      AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR s.realm_id = ANY(@realm_ids::uuid[]))
      AND ((s.rating_metric = 'renown' AND s.window_kind = 'period' AND s.difficulty_name = '' AND s.max_players = 0 AND s.performance_metric = 'none') OR (s.rating_metric IN ('peak', 'ranked_mastery') AND s.window_kind = 'period' AND @exact_cohort::boolean AND s.difficulty_name = @difficulty_name AND s.max_players = @max_players AND s.performance_metric = sqlc.arg(performance_metric)::text))
    AND (s.rating_metric = 'renown' OR ((@player_class::text = '' OR s.player_class = @player_class) AND (@player_spec::text = '' OR s.player_spec = @player_spec) AND (@player_sub_spec::text = '' OR s.player_sub_spec = @player_sub_spec)))
      AND s.encounter_name IN (SELECT encounter_name FROM selected_bosses)
    ORDER BY s.encounter_name, s.rating_metric, s.realm_id, s.player_guid, s.score DESC, COALESCE(s.best_raw, 0) DESC, s.player_class, s.player_spec, s.player_sub_spec
  ) b
  JOIN wow_server_realms realm ON realm.id = b.realm_id
  LEFT JOIN game_players gp ON gp.realm_id = b.realm_id AND gp.id = (CASE WHEN b.player_guid ~ '^0x[0-9A-Fa-f]{16}$' THEN b.player_guid::wow_guid ELSE NULL::wow_guid END)
  LEFT JOIN guilds guild ON guild.id = gp.guild_id AND guild.realm_id = b.realm_id
  UNION ALL
  SELECT 'guild'::text AS subject, 'scope'::text AS board, b.rating_metric, ''::text AS encounter_name,
         b.realm_id, b.guild_id::text AS subject_id, b.score, NULL::float8 AS best_raw, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec,
         COALESCE(guild.name, '')::text AS subject_name, realm.name::text AS realm_name,
         row_number() OVER (PARTITION BY b.rating_metric ORDER BY b.score DESC, b.realm_id, b.guild_id) AS position
  FROM (
    SELECT DISTINCT ON (s.rating_metric, s.realm_id, s.guild_id) s.*
    FROM guild_tenant_rating_scope_scores s
    JOIN rating_score_generations generation ON generation.id = s.generation_id AND generation.tenant_id = s.tenant_id AND generation.status = 'active'
    JOIN wow_server_realms source_realm ON source_realm.id = s.realm_id
    JOIN wow_servers server ON server.id = source_realm.server_id
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
      AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR s.realm_id = ANY(@realm_ids::uuid[]))
      AND ((s.rating_metric = 'renown' AND s.window_kind = 'period' AND s.difficulty_name = '' AND s.max_players = 0) OR (s.rating_metric IN ('peak', 'ranked_mastery') AND s.window_kind = 'period' AND @exact_cohort::boolean AND s.difficulty_name = @difficulty_name AND s.max_players = @max_players))
    ORDER BY s.rating_metric, s.realm_id, s.guild_id, s.score DESC
  ) b
  JOIN wow_server_realms realm ON realm.id = b.realm_id

  LEFT JOIN guilds guild ON guild.id = b.guild_id AND guild.realm_id = b.realm_id
  UNION ALL
  SELECT 'guild'::text AS subject, 'boss'::text AS board, b.rating_metric, b.encounter_name AS encounter_name,
         b.realm_id, b.guild_id::text AS subject_id, b.score, NULL::float8 AS best_raw, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec,
         COALESCE(guild.name, '')::text AS subject_name, realm.name::text AS realm_name,
         row_number() OVER (PARTITION BY b.encounter_name, b.rating_metric ORDER BY b.score DESC, b.realm_id, b.guild_id) AS position
  FROM (
    SELECT DISTINCT ON (s.encounter_name, s.rating_metric, s.realm_id, s.guild_id) s.*
    FROM guild_tenant_rating_boss_scores s
    JOIN rating_score_generations generation ON generation.id = s.generation_id AND generation.tenant_id = s.tenant_id AND generation.status = 'active'
    JOIN wow_server_realms source_realm ON source_realm.id = s.realm_id
    JOIN wow_servers server ON server.id = source_realm.server_id
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
      AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR s.realm_id = ANY(@realm_ids::uuid[]))
      AND ((s.rating_metric = 'renown' AND s.window_kind = 'period' AND s.difficulty_name = '' AND s.max_players = 0) OR (s.rating_metric IN ('peak', 'ranked_mastery') AND s.window_kind = 'period' AND @exact_cohort::boolean AND s.difficulty_name = @difficulty_name AND s.max_players = @max_players))
      AND s.encounter_name IN (SELECT encounter_name FROM selected_bosses)
    ORDER BY s.encounter_name, s.rating_metric, s.realm_id, s.guild_id, s.score DESC
  ) b
  JOIN wow_server_realms realm ON realm.id = b.realm_id

  LEFT JOIN guilds guild ON guild.id = b.guild_id AND guild.realm_id = b.realm_id
)
SELECT subject, board, rating_metric, encounter_name, realm_id, subject_id, score,
       -- Peak's throughput (0 when unknown): the kill's on a boss, and on the raid
       -- total output over total fight time across the bosses it counts.
       COALESCE(CASE WHEN subject = 'player' AND rating_metric = 'peak' THEN best_raw END, 0)::float8 AS peak_raw,
       player_class, player_spec, player_sub_spec, subject_name, realm_name
FROM boards
WHERE position <= CASE WHEN board = 'scope' OR encounter_name = @featured_encounter::text THEN 5 ELSE 1 END
ORDER BY board, encounter_name, subject, rating_metric, position;

-- name: HubSummaryInstances :many
SELECT ris.instance_name, ris.difficulty_name, ris.max_players,
       COALESCE((SELECT li.category FROM log_instances li
         JOIN wow_log_groups lg ON lg.id = li.log_group_id AND NOT lg.unlisted
         JOIN wow_server_realms realm ON realm.id = li.realm_id
         JOIN wow_servers server ON server.id = realm.server_id
         WHERE li.name = ris.instance_name AND li.difficulty_name = ris.difficulty_name
           AND li.max_players = ris.max_players AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND li.category IS NOT NULL ORDER BY li.start_time DESC LIMIT 1), '')::text AS category,
       ris.total_kills, ris.top_players
FROM rankings_instance_summaries ris
WHERE ris.tenant_id = @tenant_id
ORDER BY ris.instance_name, ris.difficulty_name, ris.max_players LIMIT 64;

-- name: HubSummaryRealms :many
SELECT realm.id, realm.name FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
ORDER BY realm.name, realm.id LIMIT 64;
-- name: HubSummaryFilters :many
-- Scope selector metadata to this tenant as well as the selected raid.
SELECT DISTINCT edr.player_class, edr.player_spec, edr.player_sub_spec
FROM encounter_dps_rankings edr
JOIN log_instances li ON li.id = edr.instance_id
JOIN wow_log_groups grp ON grp.id = li.log_group_id AND NOT grp.unlisted
JOIN wow_server_realms realm ON realm.id = edr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND edr.instance_name = @instance_name
  AND edr.player_class <> 'Unknown'
  AND edr.player_spec <> 'Unknown'
ORDER BY edr.player_class, edr.player_spec, edr.player_sub_spec;

-- name: HubSummaryEncounters :many
-- Returns encounters available in rankings for a given instance.
WITH fallback_representative_instances AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        li.id,
        COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM log_instances li
JOIN wow_log_groups li_group ON li_group.id = li.log_group_id AND NOT li_group.unlisted
    JOIN wow_server_realms tenant_realm ON tenant_realm.id = li.realm_id
    JOIN wow_servers tenant_server ON tenant_server.id = tenant_realm.server_id
    WHERE tenant_server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND li.invalidated_at IS NULL
      AND li.name = @instance_name
      AND NOT EXISTS (
        SELECT 1
        FROM ranking_runs rr
        JOIN log_instances representative ON representative.id = rr.representative_instance_id
         AND COALESCE(representative.duplicate_group_id, representative.id) = rr.run_id
         AND representative.invalidated_at IS NULL

        JOIN wow_log_groups representative_group ON representative_group.id = representative.log_group_id AND NOT representative_group.unlisted
        WHERE rr.run_id = COALESCE(li.duplicate_group_id, li.id)
    )
    ORDER BY COALESCE(li.duplicate_group_id, li.id),
        (SELECT COUNT(DISTINCT coverage.encounter_name)
         FROM encounter_dps_rankings coverage
         WHERE coverage.instance_id = li.id
           AND coverage.encounter_id IS NOT NULL) DESC,
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
),
representative_instances AS (
    SELECT rr.representative_instance_id AS id, rr.run_id
    FROM ranking_runs rr
    JOIN log_instances representative ON representative.id = rr.representative_instance_id
     AND COALESCE(representative.duplicate_group_id, representative.id) = rr.run_id
     AND representative.invalidated_at IS NULL

    JOIN wow_log_groups representative_group ON representative_group.id = representative.log_group_id AND NOT representative_group.unlisted
    JOIN wow_server_realms tenant_realm ON tenant_realm.id = rr.realm_id
    JOIN wow_servers tenant_server ON tenant_server.id = tenant_realm.server_id
    WHERE tenant_server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND rr.instance_name = @instance_name
    UNION ALL
    SELECT id, run_id FROM fallback_representative_instances
),
ranking_rows AS (
    SELECT
        edr.player_guid,
        edr.encounter_name,
        edr.dps,
        ri.run_id
    FROM encounter_dps_rankings edr
JOIN log_instances edr_instance ON edr_instance.id = edr.instance_id
JOIN wow_log_groups edr_group ON edr_group.id = edr_instance.log_group_id AND NOT edr_group.unlisted
    JOIN representative_instances ri ON ri.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    JOIN wow_servers edr_server ON edr_server.id = wsr.server_id
    WHERE edr_server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND edr.instance_name = @instance_name
)
SELECT
    r.encounter_name,
    COUNT(DISTINCT (r.player_guid, r.run_id))::bigint AS total_kills,
    MAX(r.dps)::double precision AS top_dps
FROM ranking_rows r
GROUP BY r.encounter_name
ORDER BY (r.encounter_name = 'Trash'), r.encounter_name LIMIT 30;


-- name: HubSetRatingRows :many
-- Ratings over a chosen set of bosses, computed from the published boss boards:
-- Peak and Ranked Mastery average over every chosen boss (a missed one is 0),
-- Renown sums. A subject's best class/spec cohort stands for it. Peak carries
-- the duration-weighted throughput over its kills and breaks ties by it.
WITH chosen AS (
  SELECT DISTINCT unnest(@encounter_names::text[]) AS encounter_name LIMIT 64
), player_cohorts AS (
  SELECT s.rating_metric, s.realm_id, s.player_guid, s.player_class, s.player_spec, s.player_sub_spec,
         CASE WHEN s.rating_metric = 'renown' THEN sum(s.score)
              ELSE sum(s.score) / (SELECT count(*) FROM chosen) END AS score,
         COALESCE(sum(s.best_raw * s.best_duration_secs) FILTER (WHERE s.best_raw > 0 AND s.best_duration_secs > 0)
           / NULLIF(sum(s.best_duration_secs) FILTER (WHERE s.best_raw > 0 AND s.best_duration_secs > 0), 0), 0) AS raw
  FROM player_tenant_rating_boss_scores s
  JOIN rating_score_generations generation ON generation.id = s.generation_id AND generation.tenant_id = s.tenant_id AND generation.status = 'active'
  JOIN wow_server_realms source_realm ON source_realm.id = s.realm_id
  JOIN wow_servers server ON server.id = source_realm.server_id
  WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
    AND s.encounter_name IN (SELECT encounter_name FROM chosen)
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR s.realm_id = ANY(@realm_ids::uuid[]))
    AND s.window_kind = 'period'
    AND ((s.rating_metric = 'renown' AND s.difficulty_name = '' AND s.max_players = 0 AND s.performance_metric = 'none')
      OR (s.rating_metric IN ('peak', 'ranked_mastery') AND s.difficulty_name = @difficulty_name AND s.max_players = @max_players
          AND s.performance_metric = sqlc.arg(performance_metric)::text
          AND (@player_class::text = '' OR s.player_class = @player_class)
          AND (@player_spec::text = '' OR s.player_spec = @player_spec)
          AND (@player_sub_spec::text = '' OR s.player_sub_spec = @player_sub_spec)))
  GROUP BY s.rating_metric, s.realm_id, s.player_guid, s.player_class, s.player_spec, s.player_sub_spec
), players AS (
  SELECT DISTINCT ON (rating_metric, realm_id, player_guid) *
  FROM player_cohorts
  ORDER BY rating_metric, realm_id, player_guid, score DESC, raw DESC, player_class, player_spec, player_sub_spec
), guild_scores AS (
  SELECT s.rating_metric, s.realm_id, s.guild_id,
         CASE WHEN s.rating_metric = 'renown' THEN sum(s.score)
              ELSE sum(s.score) / (SELECT count(*) FROM chosen) END AS score
  FROM guild_tenant_rating_boss_scores s
  JOIN rating_score_generations generation ON generation.id = s.generation_id AND generation.tenant_id = s.tenant_id AND generation.status = 'active'
  JOIN wow_server_realms source_realm ON source_realm.id = s.realm_id
  JOIN wow_servers server ON server.id = source_realm.server_id
  WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id AND s.instance_name = @instance_name
    AND s.encounter_name IN (SELECT encounter_name FROM chosen)
    AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (COALESCE(cardinality(@realm_ids::uuid[]), 0) = 0 OR s.realm_id = ANY(@realm_ids::uuid[]))
    AND s.window_kind = 'period'
    AND ((s.rating_metric = 'renown' AND s.difficulty_name = '' AND s.max_players = 0)
      OR (s.rating_metric IN ('peak', 'ranked_mastery') AND s.difficulty_name = @difficulty_name AND s.max_players = @max_players))
  GROUP BY s.rating_metric, s.realm_id, s.guild_id
), ranked AS (
  SELECT 'player'::text AS subject, p.rating_metric, p.realm_id, p.player_guid::text AS subject_id, p.score,
         CASE WHEN p.rating_metric = 'peak' THEN p.raw ELSE 0 END AS raw,
         p.player_class, p.player_spec, p.player_sub_spec,
         row_number() OVER (PARTITION BY p.rating_metric ORDER BY p.score DESC, CASE WHEN p.rating_metric = 'peak' THEN p.raw ELSE 0 END DESC, p.realm_id, p.player_guid) AS position
  FROM players p
  UNION ALL
  SELECT 'guild'::text, g.rating_metric, g.realm_id, g.guild_id::text, g.score, 0, ''::text, ''::text, ''::text,
         row_number() OVER (PARTITION BY g.rating_metric ORDER BY g.score DESC, g.realm_id, g.guild_id) AS position
  FROM guild_scores g
)
SELECT r.subject, r.rating_metric, r.realm_id, r.subject_id, r.score::float8 AS score, r.raw::float8 AS peak_raw,
       r.player_class, r.player_spec, r.player_sub_spec,
       COALESCE(CASE WHEN r.subject = 'player' THEN gp.name ELSE guild.name END, '')::text AS subject_name,
       realm.name::text AS realm_name
FROM ranked r
JOIN wow_server_realms realm ON realm.id = r.realm_id
LEFT JOIN game_players gp ON r.subject = 'player' AND gp.realm_id = r.realm_id
  AND gp.id = (CASE WHEN r.subject_id ~ '^0x[0-9A-Fa-f]{16}$' THEN r.subject_id::wow_guid ELSE NULL::wow_guid END)
LEFT JOIN guilds guild ON r.subject = 'guild' AND guild.id = (CASE WHEN r.subject_id ~ '^[0-9a-f-]{36}$' THEN r.subject_id::uuid ELSE NULL::uuid END)
  AND guild.realm_id = r.realm_id
WHERE r.position <= 5
ORDER BY r.subject, r.rating_metric, r.position;
