-- Blackwing Lair clears with at most 15 minutes total spent on bosses.
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
    AND ((COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) = $1::text) AND ((SELECT (parts.boss_ms)::bigint
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
SELECT m.id, m.hashed_slug, m.name, m.realm_id, m.realm_name, m.guild_id, m.guild_name,
  m.difficulty_name, m.max_players, m.started_at
FROM matched m
WHERE TRUE
ORDER BY m.started_at DESC, m.id DESC
LIMIT $3

-- args:
[
  "Blackwing Lair",
  900000,
  26
]
