-- Runs where Thrall parsed 95+ DPS on Ragnaros.
--
-- CEL:
--   players.exists(p, p.name == "Thrall" && p.parse({"bosses": ["Ragnaros"], "metric": "dps"}) >= 95)

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
    AND (EXISTS (SELECT 1 FROM log_instance_players p1 WHERE p1.instance_id = li.id AND ((lower(p1.name) = lower($1::text)) AND (EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (x.encounter_name) x.encounter_name, x.display_score, x.status
      FROM parse_score_results x
      WHERE x.tenant_id = $2::uuid AND x.instance_id = li.id AND x.player_guid = p1.unit_guid::text AND x.metric = $3::text
      ORDER BY x.encounter_name, x.created_at DESC, x.precise_score DESC) ps2 WHERE ps2.status IN ('ok', 'low_confidence') AND lower(ps2.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($5::text[]) v)) AND ps2.display_score >= $4::bigint)))))
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.id
)
SELECT m.id, m.hashed_slug, m.name, m.realm_id, m.realm_name, m.guild_id, m.guild_name,
  m.difficulty_name, m.max_players, m.started_at
FROM matched m
WHERE TRUE
ORDER BY m.started_at DESC, m.id DESC
LIMIT $6

-- args:
[
  "Thrall",
  "11111111-1111-1111-1111-111111111111",
  "dps",
  95,
  [
    "Ragnaros"
  ],
  26
]
