-- name: InsertLeaderboardLayers :exec
INSERT INTO leaderboard_layers (key, required_flavors)
VALUES ($1, $2);

-- name: InsertLeaderboardInstances :exec
INSERT INTO leaderboard_instances (instance_name)
VALUES ($1);

-- name: InsertLeaderboardInstanceVariants :exec
INSERT INTO leaderboard_instance_variants (instance_name, difficulty_name, max_players)
VALUES ($1, $2, $3);

-- name: InsertLeaderboardBosses :exec
INSERT INTO leaderboard_bosses (instance_name, encounter_name)
VALUES ($1, $2);

-- name: InsertLeaderboardSets :exec
INSERT INTO leaderboard_sets (instance_name, set_key, name)
VALUES ($1, $2, $3);

-- name: InsertLeaderboardSetMembers :exec
INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name)
VALUES ($1, $2, $3);

-- name: InsertLeaderboardInstanceOverrides :exec
INSERT INTO leaderboard_instance_overrides (layer_key, instance_name, enabled)
VALUES ($1, $2, $3);

-- name: InsertLeaderboardVariantOverrides :exec
INSERT INTO leaderboard_variant_overrides (layer_key, instance_name, difficulty_name, max_players, enabled)
VALUES ($1, $2, $3, $4, $5);

-- name: InsertLeaderboardBossOverrides :exec
INSERT INTO leaderboard_boss_overrides (layer_key, instance_name, encounter_name, enabled)
VALUES ($1, $2, $3, $4);

-- name: InsertLeaderboardSetOverrides :exec
INSERT INTO leaderboard_set_overrides (layer_key, instance_name, set_key, enabled)
VALUES ($1, $2, $3, $4);

-- name: InsertLeaderboardMemberOverrides :exec
INSERT INTO leaderboard_member_overrides (layer_key, instance_name, set_key, encounter_name, enabled, position)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: InsertLeaderboardBossRenown :exec
INSERT INTO leaderboard_boss_renown (layer_key, instance_name, encounter_name, points)
VALUES ($1, $2, $3, $4);

-- name: InsertLeaderboardVariantRenown :exec
INSERT INTO leaderboard_variant_renown (layer_key, instance_name, encounter_name, difficulty_name, max_players, points)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListLeaderboardLayers :many
SELECT key, required_flavors FROM leaderboard_layers ORDER BY key;
