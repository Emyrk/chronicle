-- Kill-time parse of 90+ on both Ragnaros and Majordomo Executus.
--
-- CEL:
--   instance.kill_time_parse({"bosses": ["Ragnaros", "Majordomo Executus"], "match": "each"}) >= 90

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
    COALESCE(li.start_time, wlg.created_at) AS started_at
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
    AND ((SELECT count(DISTINCT lower(tbs2.encounter_name)) FROM time_parse_scores tps1 JOIN time_parse_boss_scores tbs2 ON tbs2.time_parse_score_id = tps1.id WHERE tps1.tenant_id = $4::uuid AND tps1.instance_id = li.id AND tps1.lookback_days = $1::smallint AND tps1.policy_version = $2::smallint AND tps1.query_version = $3::smallint AND tbs2.server_status IN ('ok', 'low_confidence') AND lower(tbs2.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($6::text[]) v)) AND tbs2.server_display_score >= $5::bigint) = cardinality(ARRAY(SELECT lower(v) FROM unnest($6::text[]) v)))
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.id
)
SELECT m.id, m.hashed_slug, m.name, m.realm_id, m.realm_name, m.guild_id, m.guild_name,
  m.difficulty_name, m.max_players, m.started_at
FROM matched m
WHERE TRUE
ORDER BY m.started_at DESC, m.id DESC
LIMIT $7

-- args:
[
  60,
  1,
  2,
  "11111111-1111-1111-1111-111111111111",
  90,
  [
    "Ragnaros",
    "Majordomo Executus"
  ],
  26
]
