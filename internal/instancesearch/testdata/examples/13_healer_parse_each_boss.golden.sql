-- A healer with a 90+ HPS parse on each of Ragnaros and Golemagg the Incinerator.
--
-- CEL:
--   players.exists(p, p.parse({"bosses": ["Ragnaros", "Golemagg the Incinerator"], "match": "each", "metric": "hps"}) >= 90)

WITH matched AS (
  SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
    li.id,
    li.hashed_slug,
    COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) AS name,
    li.realm_id,
    wsr.name AS realm_name,
    li.guild_id,
    g.name AS guild_name,
    li.difficulty_name,
    li.max_players,
    COALESCE(li.start_time, wlg.created_at) AS started_at,
    COALESCE(li.start_time, wlg.created_at) AS sort_value
  FROM log_instances li
  JOIN wow_server_realms wsr ON wsr.id = li.realm_id
  JOIN parsed_log_group plg ON plg.id = li.log_group_id
  JOIN wow_log_groups wlg ON wlg.id = plg.id
    AND plg.parse_generation = wlg.parse_generation
    AND plg.finalized_at IS NOT NULL
    AND NOT wlg.unlisted
  LEFT JOIN server_upload_meta sm ON sm.log_group_id = li.log_group_id
  LEFT JOIN guilds g ON g.id = li.guild_id
  WHERE li.invalidated_at IS NULL
    AND (EXISTS (SELECT 1 FROM log_instance_players p1 WHERE p1.instance_id = li.id AND ((SELECT count(DISTINCT lower(ps2.encounter_name)) FROM (SELECT DISTINCT ON (x.encounter_name) x.encounter_name, x.display_score, x.status
      FROM parse_score_results x
      WHERE x.tenant_id = $1::uuid AND x.instance_id = li.id AND x.player_guid = p1.unit_guid::text AND x.metric = $2::text
      ORDER BY x.encounter_name, x.created_at DESC, x.precise_score DESC) ps2 WHERE ps2.status IN ('ok', 'low_confidence') AND lower(ps2.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($4::text[]) v)) AND ps2.display_score >= $3::bigint) = cardinality(ARRAY(SELECT lower(v) FROM unnest($4::text[]) v)))))
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.id
)
-- Summary columns are computed only for the page of results, after the
-- limit, so they never slow the search itself.
SELECT p.id, p.hashed_slug, p.name, p.realm_id, p.realm_name, p.guild_id, p.guild_name,
  p.difficulty_name, p.max_players, p.started_at,
  (SELECT count(DISTINCT lp.unit_guid) FROM log_instance_players lp WHERE lp.instance_id = p.id) AS player_count,
  (SELECT count(DISTINCT be.name) FROM log_instance_encounters be
    WHERE be.instance_id = p.id AND be.boss AND be.kill_type IN ('clean', 'partial')) AS bosses_killed,
  (SELECT sr.ranked_duration_ms FROM instance_speedruns sr
    WHERE sr.instance_id = p.id AND sr.ranked_duration_ms > 0) AS clear_time_ms,
  to_char(p.sort_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_value
FROM (
  SELECT m.*
  FROM matched m
  WHERE TRUE
  ORDER BY m.sort_value DESC NULLS LAST, m.id DESC
  LIMIT $5
) p
ORDER BY p.sort_value DESC NULLS LAST, p.id DESC

-- args:
[
  "11111111-1111-1111-1111-111111111111",
  "hps",
  90,
  [
    "Ragnaros",
    "Golemagg the Incinerator"
  ],
  26
]
