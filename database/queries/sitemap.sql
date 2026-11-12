-- Queries behind /sitemap.xml. Each is capped and scoped to one tenant's own
-- servers: RLS on wow_server_realms limits rows to what the tenant can see, and
-- the tenant_id match drops include_in_all servers whose pages are canonical
-- on another host. A NULL tenant_id is the root site's untenanted servers.

-- name: ListSitemapGuilds :many
-- Guilds as the /guilds directory lists them, guilds with an edited page first.
SELECT g.id, gp.updated_at AS page_updated_at
FROM guilds g
JOIN wow_server_realms r ON r.id = g.realm_id
JOIN wow_servers ws ON ws.id = r.server_id
LEFT JOIN guild_pages gp ON gp.guild_id = g.id
WHERE ws.tenant_id IS NOT DISTINCT FROM sqlc.narg(tenant_id)::uuid
ORDER BY gp.updated_at DESC NULLS LAST, g.created_at DESC, g.id
LIMIT @result_limit;

-- name: ListSitemapCharacters :many
-- Most recently seen characters whose latest sighting is a listed log.
-- Walks idx_game_players_updated_at newest-first and stops at the limit.
SELECT gp.id, r.name AS realm_name, gp.updated_at
FROM game_players gp
JOIN wow_server_realms r ON r.id = gp.realm_id
JOIN wow_servers ws ON ws.id = r.server_id
JOIN log_instances li ON li.id = gp.updated_from_instance
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
WHERE ws.tenant_id IS NOT DISTINCT FROM sqlc.narg(tenant_id)::uuid
ORDER BY gp.updated_at DESC
LIMIT @result_limit;

-- name: ListSitemapInstances :many
-- Most recent listed, valid, finalized instance logs.
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
ORDER BY li.start_time DESC
LIMIT @result_limit;
