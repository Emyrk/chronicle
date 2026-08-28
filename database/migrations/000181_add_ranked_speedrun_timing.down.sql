BEGIN;

DROP INDEX IF EXISTS idx_instance_speedruns_ranked_leaderboard;

ALTER TABLE instance_speedruns
    DROP CONSTRAINT IF EXISTS instance_speedruns_ranked_timing_complete,
    DROP CONSTRAINT IF EXISTS instance_speedruns_ranked_duration_nonnegative,
    DROP COLUMN IF EXISTS ranked_duration_ms,
    DROP COLUMN IF EXISTS ranked_completion_time,
    DROP COLUMN IF EXISTS ranked_start_time;

COMMIT;
