BEGIN;

DROP INDEX IF EXISTS idx_instance_speedruns_boss_to_boss_leaderboard;

ALTER TABLE instance_speedruns
    DROP CONSTRAINT IF EXISTS instance_speedruns_boss_to_boss_timing_complete,
    DROP CONSTRAINT IF EXISTS instance_speedruns_boss_to_boss_duration_nonnegative,
    DROP COLUMN IF EXISTS boss_to_boss_duration_ms,
    DROP COLUMN IF EXISTS boss_to_boss_completion_time,
    DROP COLUMN IF EXISTS boss_to_boss_start_time;

COMMIT;
