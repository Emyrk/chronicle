BEGIN;

-- Catch only rows written by stale pre-000196 application instances after the
-- manual batch completed. The manual backfill already transformed historical
-- rows, and application instances deployed with 000196 write all three timing
-- contracts correctly.
UPDATE instance_speedruns
SET
    boss_to_boss_start_time = ranked_start_time,
    boss_to_boss_completion_time = ranked_completion_time,
    boss_to_boss_duration_ms = ranked_duration_ms,
    ranked_start_time = start_time,
    ranked_completion_time = completion_time,
    ranked_duration_ms = duration_ms
WHERE qualified = true
  AND boss_to_boss_start_time IS NULL
  AND boss_to_boss_completion_time IS NULL
  AND boss_to_boss_duration_ms IS NULL
  AND ranked_start_time IS NOT NULL
  AND ranked_completion_time IS NOT NULL
  AND ranked_duration_ms IS NOT NULL
  AND duration_ms >= 0
  AND completion_time >= start_time;

COMMIT;
