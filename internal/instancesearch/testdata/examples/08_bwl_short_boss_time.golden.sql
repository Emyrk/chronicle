-- Blackwing Lair clears with at most 15 minutes total spent on bosses.
--
-- CEL:
--   instance.name == "Blackwing Lair"
--   && instance.boss_time_ms <= 900000

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
    AND ((lower(COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name)) = lower($1::text)) AND ((SELECT (parts.boss_ms)::bigint
    FROM instance_speedruns sr1
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(island_ms) FILTER (WHERE scope = 'all'), 0) AS all_ms,
        COALESCE(SUM(island_ms) FILTER (WHERE scope = 'boss'), 0) AS boss_ms
      FROM (
        SELECT scope, EXTRACT(EPOCH FROM (MAX(fight_end) - MIN(fight_start))) * 1000 AS island_ms
        FROM (
          SELECT scope, fight_start, fight_end,
            SUM(starts_island) OVER (PARTITION BY scope ORDER BY fight_start, fight_end) AS island
          FROM (
            SELECT scope, fight_start, fight_end,
              CASE WHEN fight_start <= MAX(fight_end) OVER (
                PARTITION BY scope ORDER BY fight_start, fight_end
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ) THEN 0 ELSE 1 END AS starts_island
            FROM (
              SELECT fs.scope, GREATEST(fe.start_time, sr1.ranked_start_time) AS fight_start,
                LEAST(fe.end_time, sr1.ranked_completion_time) AS fight_end
              FROM log_instance_encounters fe
              CROSS JOIN LATERAL (SELECT 'all'::text AS scope UNION ALL SELECT 'boss'::text WHERE fe.boss) fs
              WHERE fe.instance_id = li.id
            ) fights
            WHERE fight_end > fight_start
          ) marked
        ) islands
        GROUP BY scope, island
      ) merged
    ) parts
    WHERE sr1.instance_id = li.id AND sr1.ranked_duration_ms > 0) <= $2::bigint))
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
  LIMIT $3
) p
ORDER BY p.started_at DESC, p.id DESC

-- args:
[
  "Blackwing Lair",
  900000,
  26
]
