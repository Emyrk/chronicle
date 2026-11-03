-- A Blackwing Lair full clear under 75 minutes with under 8 minutes idle, zero wipes and a linked video, where a gnome warrior tanked both Vaelastrasz and Nefarian without dying on any boss, at least three priests healed 800+ HPS on Nefarian, Vaelastrasz died in under a minute, and nobody pulled Chromaggus more than once.
--
-- CEL:
--   instance.name == "Blackwing Lair"
--   && instance.clear_time_ms <= 4500000
--   && instance.idle_time_ms < 480000
--   && instance.wipes == 0
--   && instance.has_video == true
--   && players.exists(p, p.race == "Gnome" && p.class == "WARRIOR" && p.role({"bosses": ["Vaelastrasz the Corrupt", "Nefarian"], "match": "each"}) == "tank" && !(p.deaths({"on": "bosses"}) >= 1))
--   && players.filter(p, p.class == "PRIEST" && p.hps({"bosses": ["Nefarian"]}) >= 800).size() >= 3
--   && encounters.exists(e, e.name == "Vaelastrasz the Corrupt" && e.killed == true && e.duration_ms < 60000)
--   && encounters.filter(e, e.name == "Chromaggus").size() <= 1

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
    AND ((lower(COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name)) = lower($1::text)) AND ((SELECT sr.ranked_duration_ms FROM instance_speedruns sr WHERE sr.instance_id = li.id AND sr.ranked_duration_ms > 0) <= $2::bigint) AND ((SELECT (GREATEST(sr1.ranked_duration_ms - parts.all_ms, 0))::bigint
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
    WHERE sr1.instance_id = li.id AND sr1.ranked_duration_ms > 0) < $3::bigint) AND ((SELECT iom.wipe_count FROM instance_overview_metrics iom WHERE iom.instance_id = li.id) = $4::bigint) AND (EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug) = $5::boolean) AND (EXISTS (SELECT 1 FROM log_instance_players p2 WHERE p2.instance_id = li.id AND ((p2.race::text = $6::text) AND (p2.class::text = $7::text) AND ((SELECT count(DISTINCT lower(r3.encounter_name)) FROM encounter_dps_rankings r3 WHERE r3.instance_id = li.id AND r3.player_guid = p2.unit_guid::text AND r3.encounter_id IS NOT NULL AND lower(r3.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($9::text[]) v)) AND r3.player_role = $8::text) = cardinality(ARRAY(SELECT lower(v) FROM unnest($9::text[]) v))) AND (NOT (EXISTS (SELECT 1 FROM encounter_dps_rankings r4 WHERE r4.instance_id = li.id AND r4.player_guid = p2.unit_guid::text AND r4.encounter_id IS NOT NULL AND r4.player_deaths >= $10::bigint)))))) AND ((SELECT count(DISTINCT p5.unit_guid) FROM log_instance_players p5 WHERE p5.instance_id = li.id AND ((p5.class::text = $11::text) AND (EXISTS (SELECT 1 FROM encounter_dps_rankings r6 WHERE r6.instance_id = li.id AND r6.player_guid = p5.unit_guid::text AND r6.encounter_id IS NOT NULL AND lower(r6.encounter_name) = ANY(ARRAY(SELECT lower(v) FROM unnest($13::text[]) v)) AND r6.hps >= $12::float8)))) >= $14::bigint) AND (EXISTS (SELECT 1 FROM log_instance_encounters e7 WHERE e7.instance_id = li.id AND ((lower(e7.name) = lower($15::text)) AND ((e7.kill_type IN ('clean', 'partial')) = $16::boolean) AND ((EXTRACT(EPOCH FROM (e7.end_time - e7.start_time)) * 1000)::bigint < $17::bigint)))) AND ((SELECT count(e8.id) FROM log_instance_encounters e8 WHERE e8.instance_id = li.id AND (lower(e8.name) = lower($18::text))) <= $19::bigint))
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
  LIMIT $20
) p
ORDER BY p.started_at DESC, p.id DESC

-- args:
[
  "Blackwing Lair",
  4500000,
  480000,
  0,
  true,
  "Gnome",
  "WARRIOR",
  "tank",
  [
    "Vaelastrasz the Corrupt",
    "Nefarian"
  ],
  1,
  "PRIEST",
  800,
  [
    "Nefarian"
  ],
  3,
  "Vaelastrasz the Corrupt",
  true,
  60000,
  "Chromaggus",
  1,
  26
]
