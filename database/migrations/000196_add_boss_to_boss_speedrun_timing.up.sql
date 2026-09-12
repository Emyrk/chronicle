BEGIN;

-- Add the new storage alongside the existing ranked columns so the currently
-- deployed application can continue reading and writing ranked boss timing.
ALTER TABLE instance_speedruns
    ADD COLUMN IF NOT EXISTS boss_to_boss_start_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS boss_to_boss_completion_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS boss_to_boss_duration_ms BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'instance_speedruns'::regclass
          AND conname = 'instance_speedruns_boss_to_boss_duration_nonnegative'
    ) THEN
        ALTER TABLE instance_speedruns
            ADD CONSTRAINT instance_speedruns_boss_to_boss_duration_nonnegative
            CHECK (boss_to_boss_duration_ms IS NULL OR boss_to_boss_duration_ms >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'instance_speedruns'::regclass
          AND conname = 'instance_speedruns_boss_to_boss_timing_complete'
    ) THEN
        ALTER TABLE instance_speedruns
            ADD CONSTRAINT instance_speedruns_boss_to_boss_timing_complete
            CHECK (
                (boss_to_boss_start_time IS NULL AND boss_to_boss_completion_time IS NULL AND boss_to_boss_duration_ms IS NULL)
                OR
                (boss_to_boss_start_time IS NOT NULL AND boss_to_boss_completion_time IS NOT NULL AND boss_to_boss_duration_ms IS NOT NULL)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_instance_speedruns_boss_to_boss_leaderboard
    ON instance_speedruns (instance_name, boss_to_boss_duration_ms)
    WHERE qualified = true AND boss_to_boss_duration_ms IS NOT NULL;

COMMIT;
