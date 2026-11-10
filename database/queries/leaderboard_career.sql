-- name: ListLeaderboardCareerVariants :many
SELECT * FROM leaderboard_career_variants
WHERE required_flavors <@ @flavors::text[]
ORDER BY instance_name, difficulty_name, max_players;

-- name: UpsertLeaderboardCareerVariant :exec
INSERT INTO leaderboard_career_variants
(instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown, weight)
VALUES (@instance_name, @difficulty_name, @max_players, @required_flavors, @include_average, @include_renown, sqlc.narg(weight))
ON CONFLICT (instance_name, difficulty_name, max_players) DO UPDATE SET
required_flavors = EXCLUDED.required_flavors, include_average = EXCLUDED.include_average,
include_renown = EXCLUDED.include_renown, weight = EXCLUDED.weight;

-- name: LeaderboardCareerVariantActive :one
-- Input bosses are the CURRENT enabled exact boss identities from configuration,
-- including optional bosses and zero-award bosses. No subject/realm filter.
-- Fact retraction by D1 makes activation retractable without a sticky active row.
SELECT (EXISTS (
    SELECT 1 FROM leaderboard_player_renown_facts
    WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint
      AND encounter_name = ANY(@bosses::text[])
) OR EXISTS (
    SELECT 1 FROM leaderboard_guild_renown_facts
    WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text
      AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint
      AND encounter_name = ANY(@bosses::text[])
))::boolean AS active;
