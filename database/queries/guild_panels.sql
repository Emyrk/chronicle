-- Queries backing guild page panels (roster, top parses, recent raid scores).

-- name: GuildCharacterRoster :many
-- Returns the guild's characters from raid logs for the guild page "Roster"
-- panel. updated_at is the character's de-facto "last seen"; @seen_within_days
-- hides characters that have gone idle (0 = no filter).
-- player_spec/player_role come from the character's most recent parse;
-- spec_roles_json lists every distinct spec+role combo observed across the
-- character's 3 most recent parsed instances (players often swap specs raid
-- to raid), most recent first. avg_parse averages the best parse per
-- encounter over the last @parse_window_days, using hps for healers and dps
-- for everyone else (-1 when the character has no parses).
-- JOINs wow_server_realms so RLS tenant filtering cascades.
SELECT
    gp.id,
    gp.realm_id,
    gp.name,
    gp.class,
    gp.race,
    gp.level,
    gp.updated_at,
    COALESCE(wsr.name, '') AS realm_name,
    COALESCE(latest.player_spec, '')::text AS player_spec,
    COALESCE(latest.player_role, '')::text AS player_role,
    COALESCE(latest.spec_roles, '[]'::jsonb)::text AS spec_roles_json,
    COALESCE(scores.avg_parse, -1)::float8 AS avg_parse
FROM game_players gp
JOIN wow_server_realms wsr ON wsr.id = gp.realm_id
LEFT JOIN LATERAL (
    SELECT
        (ARRAY_AGG(combos.player_spec ORDER BY combos.last_seen DESC))[1] AS player_spec,
        (ARRAY_AGG(combos.player_role ORDER BY combos.last_seen DESC))[1] AS player_role,
        JSONB_AGG(
            JSONB_BUILD_OBJECT('spec', combos.player_spec, 'role', combos.player_role)
            ORDER BY combos.last_seen DESC
        ) AS spec_roles
    FROM (
        SELECT psr.player_spec, psr.player_role, MAX(psr.killed_at) AS last_seen
        FROM parse_score_results psr
        WHERE psr.tenant_id = @tenant_id
          AND psr.player_guid = gp.id::text
          AND psr.metric = 'dps'
          AND psr.status IN ('ok', 'low_confidence')
          AND psr.instance_id IN (
              SELECT recent.instance_id
              FROM (
                  SELECT psr2.instance_id, MAX(psr2.killed_at) AS latest_kill
                  FROM parse_score_results psr2
                  WHERE psr2.tenant_id = @tenant_id
                    AND psr2.player_guid = gp.id::text
                    AND psr2.metric = 'dps'
                    AND psr2.status IN ('ok', 'low_confidence')
                  GROUP BY psr2.instance_id
                  ORDER BY latest_kill DESC NULLS LAST
                  LIMIT 3
              ) recent
          )
        GROUP BY psr.player_spec, psr.player_role
    ) combos
) latest ON true
LEFT JOIN LATERAL (
    SELECT AVG(best.precise_score)::float8 AS avg_parse
    FROM (
        SELECT DISTINCT ON (psr.instance_name, psr.encounter_name)
            psr.precise_score
        FROM parse_score_results psr
        WHERE psr.tenant_id = @tenant_id
          AND psr.player_guid = gp.id::text
          AND psr.metric = CASE WHEN latest.player_role = 'heal' THEN 'hps' ELSE 'dps' END
          AND psr.status IN ('ok', 'low_confidence')
          AND psr.killed_at >= now() - make_interval(days => @parse_window_days::int)
        ORDER BY psr.instance_name, psr.encounter_name, psr.precise_score DESC
    ) best
) scores ON true
WHERE gp.guild_id = @guild_id::uuid
  AND CASE
      WHEN @seen_within_days::bigint > 0 THEN gp.updated_at >= now() - make_interval(days => @seen_within_days::int)
      ELSE true
  END
ORDER BY scores.avg_parse DESC NULLS LAST, gp.level DESC, gp.updated_at DESC
LIMIT @row_limit;

-- name: GuildTopParses :many
-- Returns the current guild members' best parses for the guild page "Top
-- Parses" panel. Membership comes from game_players, matching the roster
-- panel, rather than the guild_id copied onto parse scores at scoring time.
-- Duplicate uploads of the same run collapse to one row per encounter+player
-- (most recently computed scoring wins, matching GetCharacterParseHistory).
-- @best_per_player keeps only each player's single best parse so one player
-- cannot fill the whole board.
WITH guild_members AS (
    SELECT gp.id::text AS player_guid
    FROM game_players gp
    WHERE gp.guild_id = @guild_id::uuid
), deduped AS (
    SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.player_guid)
        psr.player_guid,
        psr.player_name,
        psr.player_class,
        psr.player_spec,
        psr.player_role,
        psr.encounter_name,
        psr.instance_id,
        COALESCE(li.hashed_slug, '')::text AS instance_slug,
        psr.instance_name,
        psr.difficulty_name,
        psr.max_players,
        psr.metric_value,
        psr.precise_score,
        psr.display_score,
        psr.killed_at
    FROM parse_score_results psr
    JOIN guild_members gm ON gm.player_guid = psr.player_guid
    LEFT JOIN log_instances li ON li.id = psr.instance_id
    WHERE psr.tenant_id = @tenant_id
      AND psr.metric = @metric
      AND psr.status IN ('ok', 'low_confidence')
      AND CASE
          WHEN @since_days::bigint > 0 THEN psr.killed_at >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
    ORDER BY psr.run_id, psr.encounter_name, psr.player_guid, psr.created_at DESC, psr.precise_score DESC
), ranked AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY player_guid
            ORDER BY precise_score DESC, killed_at DESC NULLS LAST
        ) AS per_player_rank
    FROM deduped
)
SELECT
    player_guid,
    player_name,
    player_class,
    player_spec,
    player_role,
    encounter_name,
    instance_id,
    instance_slug,
    instance_name,
    difficulty_name,
    max_players,
    metric_value,
    precise_score,
    display_score,
    killed_at
FROM ranked
WHERE CASE WHEN @best_per_player::boolean THEN per_player_rank = 1 ELSE true END
ORDER BY precise_score DESC, killed_at DESC NULLS LAST
LIMIT @row_limit;

-- name: GuildBestRuns :many
-- Returns the guild's single best full clear of each instance within the
-- window, for the guild page "Best Performance" panel. @by_parse picks the
-- winner by highest guild average parse instead of fastest clear. Duplicate
-- uploads collapse to one run (fastest duration per group). Includes
-- unqualified runs: qualification only affects the public leaderboard.
-- JOINs wow_server_realms so RLS tenant filtering cascades.
WITH clears AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        li.id AS instance_id,
        COALESCE(li.hashed_slug, '')::text AS instance_slug,
        sr.instance_name,
        li.difficulty_name,
        li.max_players,
        sr.duration_ms,
        sr.completion_time
    FROM instance_speedruns sr
    JOIN log_instances li ON li.id = sr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
    WHERE sr.guild_id = @guild_id::uuid
      AND sr.duration_ms > 0
      AND CASE
          WHEN @since_days::bigint > 0 THEN sr.completion_time >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
    ORDER BY COALESCE(li.duplicate_group_id, li.id), sr.duration_ms ASC
), scored AS (
    SELECT
        c.*,
        COALESCE(p.avg_parse, -1)::float8 AS avg_parse,
        COALESCE(p.parse_count, 0)::bigint AS parse_count
    FROM clears c
    LEFT JOIN LATERAL (
        SELECT AVG(d.precise_score) AS avg_parse, COUNT(*) AS parse_count
        FROM (
            SELECT DISTINCT ON (psr.encounter_name, psr.player_guid)
                psr.precise_score
            FROM parse_score_results psr
            WHERE psr.tenant_id = @tenant_id
              AND psr.run_id = c.run_id
              AND psr.guild_id = @guild_id::uuid
              AND psr.status IN ('ok', 'low_confidence')
              AND (
                  (psr.player_role = 'heal' AND psr.metric = 'hps')
                  OR (psr.player_role != 'heal' AND psr.metric = 'dps')
              )
            ORDER BY psr.encounter_name, psr.player_guid, psr.created_at DESC, psr.precise_score DESC
        ) d
    ) p ON true
)
SELECT DISTINCT ON (instance_name)
    run_id,
    instance_id,
    instance_slug,
    instance_name,
    difficulty_name,
    max_players,
    duration_ms,
    completion_time,
    avg_parse,
    parse_count
FROM scored
ORDER BY instance_name,
    CASE WHEN @by_parse::boolean THEN -avg_parse ELSE duration_ms::float8 END ASC,
    duration_ms ASC;

-- name: GuildEncounterKills :many
-- Per-encounter boss kill aggregates for a guild across all time, for the
-- guild page "Progression" panel. Duplicate uploads of the same raid night
-- collapse via duplicate_group_id. JOINs wow_server_realms so RLS tenant
-- filtering cascades.
SELECT
    li.name AS instance_name,
    lie.name AS encounter_name,
    li.difficulty_name,
    li.max_players,
    COUNT(DISTINCT COALESCE(li.duplicate_group_id, li.id))::int AS kills,
    MIN(lie.end_time)::timestamptz AS first_killed_at,
    MAX(lie.end_time)::timestamptz AS last_killed_at
FROM log_instance_encounters lie
JOIN log_instances li ON li.id = lie.instance_id
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
WHERE li.guild_id = @guild_id::uuid
  AND lie.boss = true
  AND lie.kill_type IN ('clean', 'partial')
GROUP BY li.name, lie.name, li.difficulty_name, li.max_players
ORDER BY li.name, lie.name;

-- name: GuildRunParseAverages :many
-- Returns the guild's average parse per encounter for each raid night (run),
-- for the guild page "Recent" panel (per-boss bars; callers weight by
-- parse_count for a whole-run average). Averages every raider's parses using
-- hps for healers and dps for everyone else. Duplicate uploads collapse to
-- one row per encounter+player before averaging.
WITH deduped AS (
    SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.player_guid)
        psr.run_id,
        psr.encounter_name,
        psr.instance_id,
        psr.precise_score,
        psr.killed_at
    FROM parse_score_results psr
    WHERE psr.tenant_id = @tenant_id
      AND psr.guild_id = @guild_id::uuid
      AND psr.run_id = ANY(@run_ids::uuid[])
      AND psr.status IN ('ok', 'low_confidence')
      AND (
          (psr.player_role = 'heal' AND psr.metric = 'hps')
          OR (psr.player_role != 'heal' AND psr.metric = 'dps')
      )
    ORDER BY psr.run_id, psr.encounter_name, psr.player_guid, psr.created_at DESC, psr.precise_score DESC
), grouped AS (
    SELECT
        run_id,
        encounter_name,
        (ARRAY_AGG(instance_id))[1] AS instance_id,
        AVG(precise_score)::float8 AS avg_parse,
        COUNT(*)::bigint AS parse_count,
        MIN(killed_at)::timestamptz AS killed_at
    FROM deduped
    GROUP BY run_id, encounter_name
)
SELECT
    g.run_id,
    g.encounter_name,
    g.avg_parse,
    g.parse_count,
    g.killed_at,
    COALESCE(kill.duration_ms, 0)::bigint AS kill_duration_ms
FROM grouped g
LEFT JOIN LATERAL (
    SELECT (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint AS duration_ms
    FROM log_instance_encounters lie
    WHERE lie.instance_id = g.instance_id
      AND lie.name = g.encounter_name
      AND lie.boss = true
      AND lie.kill_type IN ('clean', 'partial')
    ORDER BY lie.end_time DESC
    LIMIT 1
) kill ON true
ORDER BY g.run_id, g.killed_at ASC NULLS LAST;
