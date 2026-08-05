-- Queries backing guild page panels (roster, top parses, recent raid scores).

-- name: GuildCharacterRoster :many
-- Returns the guild's characters from raid logs for the guild page "Roster"
-- panel. updated_at is the character's de-facto "last seen"; @seen_within_days
-- hides characters that have gone idle (0 = no filter).
-- Spec/role come from the character's most recent parse; avg_parse averages
-- the best parse per encounter over the last @parse_window_days, using hps
-- for healers and dps for everyone else (-1 when the character has no parses).
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
    COALESCE(scores.avg_parse, -1)::float8 AS avg_parse
FROM game_players gp
JOIN wow_server_realms wsr ON wsr.id = gp.realm_id
LEFT JOIN LATERAL (
    SELECT psr.player_spec, psr.player_role
    FROM parse_score_results psr
    WHERE psr.tenant_id = @tenant_id
      AND psr.player_guid = gp.id::text
      AND psr.metric = 'dps'
      AND psr.status IN ('ok', 'low_confidence')
    ORDER BY psr.killed_at DESC NULLS LAST
    LIMIT 1
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
-- Returns a guild's best parses for the guild page "Top Parses" panel.
-- Duplicate uploads of the same run collapse to one row per encounter+player
-- (most recently computed scoring wins, matching GetCharacterParseHistory).
-- @best_per_player keeps only each player's single best parse so one player
-- cannot fill the whole board.
WITH deduped AS (
    SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.player_guid)
        psr.player_guid,
        psr.player_name,
        psr.player_class,
        psr.player_spec,
        psr.player_role,
        psr.encounter_name,
        psr.instance_name,
        psr.difficulty_name,
        psr.max_players,
        psr.metric_value,
        psr.precise_score,
        psr.display_score,
        psr.killed_at
    FROM parse_score_results psr
    WHERE psr.tenant_id = @tenant_id
      AND psr.guild_id = @guild_id::uuid
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

-- name: GuildRunParseAverages :many
-- Returns the guild's average parse per raid night (run) for the guild page
-- "Recent" panel. Averages every raider's parses using hps for healers and
-- dps for everyone else. Duplicate uploads collapse to one row per
-- encounter+player before averaging.
WITH deduped AS (
    SELECT DISTINCT ON (psr.run_id, psr.encounter_name, psr.player_guid)
        psr.run_id,
        psr.precise_score
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
)
SELECT
    run_id,
    AVG(precise_score)::float8 AS avg_parse,
    COUNT(*)::bigint AS parse_count
FROM deduped
GROUP BY run_id;
