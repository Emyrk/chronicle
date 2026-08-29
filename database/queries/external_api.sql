-- name: ListExternalAPIServers :many
SELECT
    ws.id,
    ws.name,
    ws.description,
    ws.url,
    wsr.id AS realm_id,
    wsr.name AS realm_name,
    wsr.description AS realm_description,
    wsr.url AS realm_url
FROM wow_servers ws
LEFT JOIN wow_server_realms wsr ON wsr.server_id = ws.id
ORDER BY ws.name, wsr.name;

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
    COALESCE((
        SELECT COUNT(*)
        FROM log_instance_encounters lie
        WHERE lie.instance_id = d.id
          AND lie.boss = true
          AND lie.kill_type IN ('clean', 'partial')
    ), 0)::int AS boss_kills,
    COALESCE(parses.performance, '[]'::jsonb)::text AS performance_json
FROM deduped d
LEFT JOIN guilds g ON g.id = d.guild_id
LEFT JOIN LATERAL (
    SELECT jsonb_agg(
        jsonb_build_object(
            'encounter_name', encounter_scores.encounter_name,
            'dps_parse', encounter_scores.dps_parse,
            'hps_parse', encounter_scores.hps_parse
        )
        ORDER BY encounter_scores.encounter_name
    ) AS performance
    FROM (
        SELECT
            psr.encounter_name,
            MAX(psr.display_score) FILTER (WHERE psr.metric = 'dps') AS dps_parse,
            MAX(psr.display_score) FILTER (WHERE psr.metric = 'hps') AS hps_parse
        FROM parse_score_results psr
        WHERE psr.run_id = d.run_id
          AND psr.player_guid = (@player_guid::wow_guid)::text
          AND psr.tenant_id = @tenant_id
          AND psr.status IN ('ok', 'low_confidence')
        GROUP BY psr.encounter_name
    ) encounter_scores
) parses ON true
ORDER BY d.started_at DESC, d.id DESC
LIMIT @result_limit
OFFSET @result_offset;


-- name: ListExternalAPILeaderboardDuplicateLogs :many
-- Returns the logs excluded by duplicate-group deduplication for each selected
-- leaderboard instance. The selected instance is the canonical leaderboard log
-- for the requested timing mode; every other member of its duplicate group is
-- returned here, including unqualified runs.
SELECT
    selected.id AS selected_instance_id,
    duplicate.id,
    duplicate.hashed_slug,
    COALESCE(CASE
        WHEN @use_ranked_timing::boolean THEN duplicate_speedrun.ranked_duration_ms
        ELSE duplicate_speedrun.duration_ms
    END, 0)::bigint AS duration_ms,
    CASE
        WHEN @use_ranked_timing::boolean THEN duplicate_speedrun.ranked_start_time
        ELSE duplicate_speedrun.start_time
    END::timestamptz AS start_time,
    CASE
        WHEN @use_ranked_timing::boolean THEN duplicate_speedrun.ranked_completion_time
        ELSE duplicate_speedrun.completion_time
    END::timestamptz AS completion_time,
    duplicate.parser_version,
    COALESCE(duplicate_speedrun.addon_version, '')::text AS addon_version,
    (youtube.video_url IS NOT NULL)::boolean AS has_youtube_video,
    COALESCE(youtube.video_url, '')::text AS youtube_url
FROM log_instances selected
JOIN log_instances duplicate
  ON duplicate.duplicate_group_id = selected.duplicate_group_id
 AND duplicate.id != selected.id
JOIN wow_server_realms duplicate_realm ON duplicate_realm.id = duplicate.realm_id
LEFT JOIN instance_speedruns duplicate_speedrun ON duplicate_speedrun.instance_id = duplicate.id
LEFT JOIN LATERAL (
    SELECT yt.video_url
    FROM log_instance_youtube_timestamped yt
    WHERE yt.log_instance_id = duplicate.id OR yt.instance_slug = duplicate.hashed_slug
    LIMIT 1
) youtube ON true
WHERE selected.id = ANY(@selected_instance_ids::uuid[])
  AND selected.duplicate_group_id IS NOT NULL
ORDER BY selected.id, duplicate.id;
