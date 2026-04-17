-- name: GetLeaderboardVersionRequirements :one
SELECT * FROM leaderboard_version_requirements WHERE instance_name = $1;

-- name: UpsertLeaderboardVersionRequirements :one
INSERT INTO leaderboard_version_requirements (
    instance_name, min_parser_version, min_parser_version_num,
    min_addon_version, min_addon_version_num, updated_at
) VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (instance_name) DO UPDATE SET
    min_parser_version = $2, min_parser_version_num = $3,
    min_addon_version = $4, min_addon_version_num = $5,
    updated_at = now()
RETURNING *;

-- name: ListLeaderboardVersionRequirements :many
SELECT * FROM leaderboard_version_requirements ORDER BY instance_name;
