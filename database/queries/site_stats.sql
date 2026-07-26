-- name: SiteStats :one
-- Aggregate public site statistics for the homepage.
-- Each subquery JOINs wow_server_realms so RLS tenant filtering cascades.
SELECT
    (SELECT COUNT(*)
       FROM log_instances li
       JOIN wow_server_realms wsr ON wsr.id = li.realm_id)::bigint AS logs_parsed,
    (SELECT COUNT(*)
       FROM game_players gp
       JOIN wow_server_realms wsr ON wsr.id = gp.realm_id)::bigint AS players_tracked,
    (SELECT COUNT(*)
       FROM guilds g
       JOIN wow_server_realms wsr ON wsr.id = g.realm_id)::bigint AS guild_count,
    (SELECT COUNT(*)
       FROM log_instance_encounters lie
       JOIN log_instances li ON li.id = lie.instance_id
       JOIN wow_server_realms wsr ON wsr.id = li.realm_id
      WHERE lie.boss = true
        AND lie.kill_type IN ('clean', 'partial'))::bigint AS boss_kills;
