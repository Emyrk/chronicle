-- Raids with at least 2 paladins who played Holy on a boss kill.
--
-- CEL:
--   players.filter(p, p.class == "PALADIN" && p.spec == "Holy").size() >= 2

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
    AND ((SELECT count(DISTINCT p1.unit_guid) FROM log_instance_players p1 WHERE p1.instance_id = li.id AND ((p1.class::text = $1::text) AND (EXISTS (SELECT 1 FROM encounter_dps_rankings r2 WHERE r2.instance_id = li.id AND r2.player_guid = p1.unit_guid::text AND r2.encounter_id IS NOT NULL AND r2.player_spec = $2::text)))) >= $3::bigint)
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.id
)
SELECT m.id, m.hashed_slug, m.name, m.realm_id, m.realm_name, m.guild_id, m.guild_name,
  m.difficulty_name, m.max_players, m.started_at
FROM matched m
WHERE TRUE
ORDER BY m.started_at DESC, m.id DESC
LIMIT $4

-- args:
[
  "PALADIN",
  "Holy",
  2,
  26
]
