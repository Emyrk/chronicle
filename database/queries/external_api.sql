-- name: ListExternalAPIServers :many
SELECT id, name, description, url
FROM wow_servers
ORDER BY name;

-- name: ResolveExternalAPIServer :one
SELECT id, name, description, url, tenant_id
FROM wow_servers
WHERE id::text = @server::text OR lower(name) = lower(@server::text)
LIMIT 1;

-- name: ListExternalAPIRealms :many
SELECT
    wsr.id,
    wsr.server_id,
    wsr.name,
    wsr.description,
    wsr.url
FROM wow_server_realms wsr
JOIN wow_servers ws ON ws.id = wsr.server_id
WHERE ws.id::text = @server::text OR lower(ws.name) = lower(@server::text)
ORDER BY wsr.name;

-- name: ResolveExternalAPIRealm :one
SELECT
    wsr.id,
    wsr.server_id,
    wsr.name,
    wsr.description,
    wsr.url,
    ws.name AS server_name,
    ws.description AS server_description,
    ws.url AS server_url,
    ws.tenant_id
FROM wow_server_realms wsr
JOIN wow_servers ws ON ws.id = wsr.server_id
WHERE (ws.id::text = @server::text OR lower(ws.name) = lower(@server::text))
  AND (wsr.id::text = @realm::text OR lower(wsr.name) = lower(@realm::text))
LIMIT 1;

-- name: GetExternalAPICharacter :one
SELECT
    gp.id,
    gp.realm_id,
    gp.name,
    gp.class,
    gp.race,
    gp.gender,
    gp.level,
    gp.guild_id,
    COALESCE(g.name, '') AS guild_name,
    gp.updated_at,
    gp.updated_from_instance,
    COALESCE(latest.player_spec, '')::text AS player_spec,
    COALESCE(latest.player_role, '')::text AS player_role,
    COALESCE(latest.avg_ilvl, 0)::smallint AS avg_ilvl
FROM game_players gp
LEFT JOIN guilds g ON g.id = gp.guild_id
LEFT JOIN LATERAL (
    SELECT edr.player_spec, edr.player_role, edr.avg_ilvl
    FROM encounter_dps_rankings edr
    WHERE edr.realm_id = gp.realm_id
      AND edr.player_guid = gp.id::text
      AND edr.encounter_id IS NOT NULL
    ORDER BY edr.killed_at DESC, edr.created_at DESC
    LIMIT 1
) latest ON true
WHERE gp.realm_id = @realm_id
  AND (gp.id = @identifier::wow_guid OR lower(gp.name) = lower(@name))
LIMIT 1;

-- name: ListExternalAPICharacterLogs :many
WITH participation AS (
    SELECT
        li.id,
        li.hashed_slug,
        li.name,
        li.realm_id,
        li.guild_id,
        li.difficulty_name,
        li.max_players,
        COALESCE(li.start_time, wlg.created_at) AS started_at,
        COALESCE(li.end_time, li.start_time, wlg.created_at) AS ended_at,
        wlg.created_at AS uploaded_at,
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        ROW_NUMBER() OVER (
            PARTITION BY COALESCE(li.duplicate_group_id, li.id)
            ORDER BY COALESCE(li.start_time, wlg.created_at) DESC, li.id DESC
        ) AS duplicate_rank
    FROM log_instance_players lip
    JOIN log_instances li ON li.id = lip.instance_id
    JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
    WHERE lip.unit_guid = @player_guid::wow_guid
      AND li.realm_id = @realm_id
), deduped AS (
    SELECT *
    FROM participation
    WHERE duplicate_rank = 1
)
SELECT
    d.id,
    d.hashed_slug,
    d.name,
    d.realm_id,
    d.guild_id,
    COALESCE(g.name, '') AS guild_name,
    d.difficulty_name,
    d.max_players,
    d.started_at,
    d.ended_at,
    d.uploaded_at,
    COALESCE(metrics.boss_kills, 0)::int AS boss_kills,
    COALESCE(metrics.best_dps, 0)::float8 AS best_dps,
    COALESCE(metrics.best_hps, 0)::float8 AS best_hps,
    COALESCE(metrics.avg_ilvl, 0)::smallint AS avg_ilvl,
    COALESCE(metrics.player_spec, '')::text AS player_spec,
    COALESCE(metrics.player_role, '')::text AS player_role,
    COALESCE(parses.best_dps_parse, 0)::smallint AS best_dps_parse,
    COALESCE(parses.best_hps_parse, 0)::smallint AS best_hps_parse
FROM deduped d
LEFT JOIN guilds g ON g.id = d.guild_id
LEFT JOIN LATERAL (
    SELECT
        COUNT(DISTINCT edr.encounter_id) FILTER (WHERE edr.encounter_id IS NOT NULL) AS boss_kills,
        MAX(edr.dps) FILTER (WHERE edr.encounter_id IS NOT NULL AND edr.dps > 0) AS best_dps,
        MAX(edr.hps) FILTER (WHERE edr.encounter_id IS NOT NULL AND edr.hps > 0) AS best_hps,
        MAX(edr.avg_ilvl) FILTER (WHERE edr.encounter_id IS NOT NULL) AS avg_ilvl,
        (ARRAY_AGG(edr.player_spec ORDER BY edr.killed_at DESC) FILTER (WHERE edr.encounter_id IS NOT NULL))[1] AS player_spec,
        (ARRAY_AGG(edr.player_role ORDER BY edr.killed_at DESC) FILTER (WHERE edr.encounter_id IS NOT NULL))[1] AS player_role
    FROM encounter_dps_rankings edr
    JOIN log_instances metrics_instance ON metrics_instance.id = edr.instance_id
    WHERE COALESCE(metrics_instance.duplicate_group_id, metrics_instance.id) = d.run_id
      AND edr.player_guid = (@player_guid::wow_guid)::text
) metrics ON true
LEFT JOIN LATERAL (
    SELECT
        MAX(psr.display_score) FILTER (WHERE psr.metric = 'dps' AND psr.status IN ('ok', 'low_confidence')) AS best_dps_parse,
        MAX(psr.display_score) FILTER (WHERE psr.metric = 'hps' AND psr.status IN ('ok', 'low_confidence')) AS best_hps_parse
    FROM parse_score_results psr
    WHERE psr.run_id = d.run_id
      AND psr.player_guid = (@player_guid::wow_guid)::text
      AND psr.tenant_id = @tenant_id
) parses ON true
ORDER BY d.started_at DESC, d.id DESC
LIMIT @result_limit
OFFSET @result_offset;
