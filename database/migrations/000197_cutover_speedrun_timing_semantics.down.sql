BEGIN;

-- Restore the pre-cutover ranked meaning from the preserved boss timing.
UPDATE instance_speedruns
SET
    ranked_start_time = boss_to_boss_start_time,
    ranked_completion_time = boss_to_boss_completion_time,
    ranked_duration_ms = boss_to_boss_duration_ms
WHERE boss_to_boss_start_time IS NOT NULL
  AND boss_to_boss_completion_time IS NOT NULL
  AND boss_to_boss_duration_ms IS NOT NULL;

COMMIT;
