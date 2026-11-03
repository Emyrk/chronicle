-- Runs a specific character was in that had a clear parse of 50+.
--
-- CEL:
--   players.exists(p, p.guid == "0x0000000000012345")
--   && instance.clear_parse >= 50

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
    AND ((EXISTS (SELECT 1 FROM log_instance_players p1 WHERE p1.instance_id = li.id AND (p1.unit_guid::text = $1::text))) AND ((SELECT tps2.clear_server_display_score FROM time_parse_scores tps2 WHERE tps2.tenant_id = $5::uuid AND tps2.instance_id = li.id AND tps2.lookback_days = $2::smallint AND tps2.policy_version = $3::smallint AND tps2.query_version = $4::smallint AND tps2.clear_server_status IN ('ok', 'low_confidence')) >= $6::bigint))
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
  "0x0000000000012345",
  60,
  1,
  2,
  "11111111-1111-1111-1111-111111111111",
  50,
  26
]
