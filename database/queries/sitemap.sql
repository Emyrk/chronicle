-- Queries behind /sitemap.xml. Each is capped and scoped to one tenant's own
-- servers: RLS on wow_server_realms limits rows to what the tenant can see, and
-- the tenant_id match drops include_in_all servers whose pages are canonical
-- on another host. A NULL tenant_id is the root site's untenanted servers.
--
-- Only pages worth finding are listed; the bars are parameters set in api/seo.go.

-- name: ListSitemapGuilds :many
-- Guilds with an edited page, or with at least min_instances listed, valid,
-- finalized runs. Edited pages first, then the most recently active.
-- last_modified is the newer of the page edit and the newest listed run. The
-- run count probes idx_log_instances_guild.
SELECT g.id, GREATEST(gp.updated_at, runs.last_run)::timestamptz AS last_modified
FROM guilds g
JOIN wow_server_realms r ON r.id = g.realm_id
JOIN wow_servers ws ON ws.id = r.server_id
LEFT JOIN guild_pages gp ON gp.guild_id = g.id
CROSS JOIN LATERAL (
  SELECT COUNT(*) AS instances, MAX(li.start_time) AS last_run
  FROM log_instances li
  JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
    AND NOT wlg.unlisted
    AND wlg.invalidated_at IS NULL
  JOIN parsed_log_group plg ON plg.id = li.log_group_id
    AND plg.parse_generation = wlg.parse_generation
    AND plg.finalized_at IS NOT NULL
  WHERE li.guild_id = g.id
    AND li.invalidated_at IS NULL
) runs
WHERE ws.tenant_id IS NOT DISTINCT FROM sqlc.narg(tenant_id)::uuid
  AND (gp.id IS NOT NULL OR runs.instances >= @min_instances::bigint)
ORDER BY (gp.id IS NOT NULL) DESC, last_modified DESC NULLS LAST, g.id
LIMIT @result_limit;

-- name: ListSitemapCharacters :many
-- Characters with a known class, seen since @seen_since, whose latest sighting
-- is a listed log and who appear in at least min_instances listed, valid,
-- finalized logs. Walks idx_game_players_updated_at newest-first and stops at
-- the limit; the instance count probes idx_log_instance_players_unit_guid_instance
-- and stops at min_instances.
SELECT gp.id, r.name AS realm_name, gp.updated_at
FROM game_players gp
JOIN wow_server_realms r ON r.id = gp.realm_id
JOIN wow_servers ws ON ws.id = r.server_id
JOIN log_instances li ON li.id = gp.updated_from_instance
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
WHERE ws.tenant_id IS NOT DISTINCT FROM sqlc.narg(tenant_id)::uuid
  AND gp.updated_at >= @seen_since::timestamptz
  AND gp.class <> 'UNKNOWN'
  AND (
    SELECT COUNT(*) FROM (
      SELECT 1
      FROM log_instance_players lip
      JOIN log_instances sli ON sli.id = lip.instance_id
        AND sli.realm_id = gp.realm_id
        AND sli.invalidated_at IS NULL
      JOIN wow_log_groups swlg ON swlg.id = sli.log_group_id
        AND NOT swlg.unlisted
        AND swlg.invalidated_at IS NULL
      JOIN parsed_log_group splg ON splg.id = sli.log_group_id
        AND splg.parse_generation = swlg.parse_generation
        AND splg.finalized_at IS NOT NULL
      WHERE lip.unit_guid = gp.id
      LIMIT @min_instances::int
    ) seen
  ) >= @min_instances::int
ORDER BY gp.updated_at DESC
LIMIT @result_limit;

-- name: ListSitemapInstances :many
-- Most recent listed, valid, finalized instance logs that are real clears: at
-- least one boss kill, at least min_minutes long and min_players players.
-- Walks idx_log_instances_start_time newest-first and stops at the limit.
SELECT li.id, li.hashed_slug, li.updated_at
FROM log_instances li
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
  AND NOT wlg.unlisted
  AND wlg.invalidated_at IS NULL
JOIN parsed_log_group plg ON plg.id = li.log_group_id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
JOIN wow_server_realms r ON r.id = li.realm_id
JOIN wow_servers ws ON ws.id = r.server_id
WHERE li.start_time IS NOT NULL
  AND li.invalidated_at IS NULL
  AND ws.tenant_id IS NOT DISTINCT FROM sqlc.narg(tenant_id)::uuid
  AND li.end_time >= li.start_time + make_interval(mins => @min_minutes::int)
  -- Uses idx_log_instance_encounters_instance_id.
  AND EXISTS (
    SELECT 1 FROM log_instance_encounters lie
    WHERE lie.instance_id = li.id
      AND lie.boss
      AND lie.invalidated_at IS NULL
      AND lie.kill_type IN ('clean', 'partial')
  )
  -- Uses idx_log_instance_players_instance_id and stops at min_players.
  AND (
    SELECT COUNT(*) FROM (
      SELECT 1 FROM log_instance_players lip
      WHERE lip.instance_id = li.id
      LIMIT @min_players::int
    ) players
  ) >= @min_players::int
ORDER BY li.start_time DESC
LIMIT @result_limit;
