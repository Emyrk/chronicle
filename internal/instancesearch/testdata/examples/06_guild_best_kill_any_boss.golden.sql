-- Any boss kill that was in the top 1% of the guild's own kill times.
--
-- CEL:
--   instance.kill_time_parse({"parse_scope": "guild"}) >= 99

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
    AND (EXISTS (SELECT 1 FROM time_parse_scores tps1 JOIN time_parse_boss_scores tbs2 ON tbs2.time_parse_score_id = tps1.id WHERE tps1.tenant_id = $4::uuid AND tps1.instance_id = li.id AND tps1.lookback_days = $1::smallint AND tps1.policy_version = $2::smallint AND tps1.query_version = $3::smallint AND tbs2.guild_status IN ('ok', 'low_confidence') AND tbs2.guild_display_score >= $5::bigint))
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
    WHERE sr.instance_id = p.id AND sr.ranked_duration_ms > 0) AS clear_time_ms
FROM (
  SELECT m.*
  FROM matched m
  WHERE TRUE
  ORDER BY m.started_at DESC, m.id DESC
  LIMIT $6
) p
ORDER BY p.started_at DESC, p.id DESC

-- args:
[
  60,
  1,
  2,
  "11111111-1111-1111-1111-111111111111",
  99,
  26
]
