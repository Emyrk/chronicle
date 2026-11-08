-- A benchmark-only change must affect all bands at read time, without a subject
-- refresh or raw-observation replay.
UPDATE leaderboard_player_boss_benchmarks SET best_metric=200
WHERE tenant_id='00000000-0000-4000-8000-000000000001';
