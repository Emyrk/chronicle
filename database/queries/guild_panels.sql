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
JOIN wow_log_groups li_group ON li_group.id = li.log_group_id AND NOT li_group.unlisted
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
WHERE li.guild_id = @guild_id::uuid
  AND lie.boss = true
  AND lie.kill_type IN ('clean', 'partial')
GROUP BY li.name, lie.name, li.difficulty_name, li.max_players
ORDER BY li.name, lie.name;
