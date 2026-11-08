-- name: ListLeaderboardPlayerObservations :many
SELECT * FROM leaderboard_player_observations WHERE tenant_id = @tenant_id::uuid;

-- name: ListLeaderboardPlayerBossSubjects :many
SELECT * FROM leaderboard_player_boss_subjects WHERE tenant_id = @tenant_id::uuid;

-- name: ListLeaderboardDirtyRuns :many
SELECT * FROM leaderboard_dirty_runs WHERE tenant_id = @tenant_id::uuid;
