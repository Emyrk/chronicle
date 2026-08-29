BEGIN;

ALTER TABLE instance_speedruns
    ADD COLUMN ranked_start_time TIMESTAMPTZ,
    ADD COLUMN ranked_completion_time TIMESTAMPTZ,
    ADD COLUMN ranked_duration_ms BIGINT;

-- Preserve the existing leaderboard while old logs wait to be reparsed. New
-- parses write boss-to-boss ranked timing; reparsing replaces these legacy
-- clear-time values with the precise ranked boundaries.
UPDATE instance_speedruns
SET
    ranked_start_time = start_time,
    ranked_completion_time = completion_time,
    ranked_duration_ms = duration_ms
WHERE duration_ms >= 0
  AND completion_time >= start_time;

ALTER TABLE instance_speedruns
    ADD CONSTRAINT instance_speedruns_ranked_duration_nonnegative
        CHECK (ranked_duration_ms IS NULL OR ranked_duration_ms >= 0),
    ADD CONSTRAINT instance_speedruns_ranked_timing_complete
        CHECK (
            (ranked_start_time IS NULL AND ranked_completion_time IS NULL AND ranked_duration_ms IS NULL)
            OR
            (ranked_start_time IS NOT NULL AND ranked_completion_time IS NOT NULL AND ranked_duration_ms IS NOT NULL)
        );

CREATE INDEX idx_instance_speedruns_ranked_leaderboard
    ON instance_speedruns (instance_name, ranked_duration_ms)
    WHERE qualified = true AND ranked_duration_ms IS NOT NULL;

COMMIT;
