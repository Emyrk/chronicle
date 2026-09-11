-- Run after migration 000196 and its application code are deployed. Re-run
-- until updated_rows and remaining_rows are both 0. Each execution updates at
-- most 1,000 rows and commits independently.
--
-- This completes the timing semantic cutover for historical rows before PR 631
-- is deployed: preserve historical ranked timing as Boss time, then initialize
-- ranked Full raid timing from raw clear timing.
BEGIN;

WITH batch AS (
    SELECT instance_id
    FROM instance_speedruns
    WHERE qualified = true
      AND boss_to_boss_start_time IS NULL
      AND boss_to_boss_completion_time IS NULL
      AND boss_to_boss_duration_ms IS NULL
      AND ranked_start_time IS NOT NULL
      AND ranked_completion_time IS NOT NULL
      AND ranked_duration_ms IS NOT NULL
    ORDER BY instance_id
    LIMIT 1000
    FOR UPDATE SKIP LOCKED
), updated AS (
    UPDATE instance_speedruns AS speedrun
    SET
        boss_to_boss_start_time = speedrun.ranked_start_time,
        boss_to_boss_completion_time = speedrun.ranked_completion_time,
        boss_to_boss_duration_ms = speedrun.ranked_duration_ms,
        ranked_start_time = speedrun.start_time,
        ranked_completion_time = speedrun.completion_time,
        ranked_duration_ms = speedrun.duration_ms
    FROM batch
    WHERE speedrun.instance_id = batch.instance_id
    RETURNING 1
)
SELECT count(*) AS updated_rows
FROM updated;

COMMIT;

SELECT count(*) AS remaining_rows
FROM instance_speedruns
WHERE qualified = true
  AND boss_to_boss_start_time IS NULL
  AND boss_to_boss_completion_time IS NULL
  AND boss_to_boss_duration_ms IS NULL
  AND ranked_start_time IS NOT NULL
  AND ranked_completion_time IS NOT NULL
  AND ranked_duration_ms IS NOT NULL;
