-- name: InsertInstanceSpeedrun :exec
INSERT INTO instance_speedruns (
    instance_id, instance_name, realm_id, guild_id,
    qualified, start_time, completion_time, duration_ms, proof,
    addon_version, parser_version_num, addon_version_num
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: GetInstanceSpeedrun :one
SELECT * FROM instance_speedruns WHERE instance_id = $1;

-- name: SpeedrunLeaderboard :many
-- Returns best qualified run per duplicate group for a given instance name.
-- Filters out entries below admin-configured minimum version requirements.
SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
    sr.instance_id,
    sr.instance_name,
    sr.duration_ms,
    sr.start_time,
    sr.completion_time,
    sr.qualified,
    sr.addon_version,
    li.hashed_slug,
    li.duplicate_group_id,
    li.parser_version,
    COALESCE(g.name, '') AS guild_name,
    COALESCE(wsr.name, '') AS realm_name
FROM instance_speedruns sr
JOIN log_instances li ON li.id = sr.instance_id
LEFT JOIN guilds g ON sr.guild_id = g.id
LEFT JOIN wow_server_realms wsr ON sr.realm_id = wsr.id
LEFT JOIN leaderboard_version_requirements lvr ON lvr.instance_name = sr.instance_name
WHERE sr.instance_name = @instance_name
  AND sr.qualified = true
  AND sr.parser_version_num >= COALESCE(lvr.min_parser_version_num, 0)
  AND sr.addon_version_num >= COALESCE(lvr.min_addon_version_num, 0)
ORDER BY COALESCE(li.duplicate_group_id, li.id), sr.duration_ms ASC;
