BEGIN;

-- Deployment gate: these evidence tables have no automatic producer in PR1.
-- Confirm they are still empty/small before rollout. CREATE INDEX scans each
-- table and blocks writes; populated installations need an approved maintenance
-- window or separately prepared concurrent indexes, not a surprise startup scan.
-- Local EXPLAIN evidence: docs/leaderboard-v2/materialization-pr1-measurements.md.
-- Existing scope indexes already cover exact-subject histories and kill counts.
CREATE INDEX leaderboard_player_observations_best_idx
    ON leaderboard_player_observations (
        tenant_id, instance_name, difficulty_name, max_players, encounter_name,
        player_class, player_spec, player_sub_spec, metric, metric_value DESC
    );
CREATE INDEX leaderboard_guild_boss_observations_best_idx
    ON leaderboard_guild_boss_observations (
        tenant_id, instance_name, difficulty_name, max_players, encounter_name, duration_ms
    );
CREATE INDEX leaderboard_guild_clear_observations_best_idx
    ON leaderboard_guild_clear_observations (
        tenant_id, instance_name, difficulty_name, max_players, duration_ms
    );
COMMIT;
