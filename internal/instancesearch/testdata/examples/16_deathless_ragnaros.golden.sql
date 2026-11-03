-- Ragnaros killed with no player deaths on the kill.
--
-- CEL:
--   instance.kill_time_ms({"bosses": ["Ragnaros"]}) > 0
--   && !(players.exists(p, p.deaths({"bosses": ["Ragnaros"]}) >= 1))

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
    AND ((EXISTS (SELECT 1 FROM log_instance_encounters k1 WHERE k1.instance_id = li.id AND k1.boss AND k1.kill_type IN ('clean', 'partial') AND lower(k1.name) = ANY(ARRAY(SELECT lower(v) FROM unnest($2::text[]) v)) AND (EXTRACT(EPOCH FROM (k1.end_time - k1.start_time)) * 1000)::bigint > $1::bigint)) AND (NOT (EXISTS (SELECT 1 FROM log_instance_players p2 WHERE p2.instance_id = li.id AND (EXISTS (SELECT 1 FROM encounter_dps_rankings r3 WHERE r3.instance_id = li.id AND r3.player_guid = p2.unit_guid::text AND r3.encounter_id IS NOT NULL AND lower(r3.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($4::text[]) v)) AND r3.player_deaths >= $3::bigint))))))
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.id
)
SELECT m.id, m.hashed_slug, m.name, m.realm_id, m.realm_name, m.guild_id, m.guild_name,
  m.difficulty_name, m.max_players, m.started_at
FROM matched m
WHERE TRUE
ORDER BY m.started_at DESC, m.id DESC
LIMIT $5

-- args:
[
  0,
  [
    "Ragnaros"
  ],
  1,
  [
    "Ragnaros"
  ],
  26
]
