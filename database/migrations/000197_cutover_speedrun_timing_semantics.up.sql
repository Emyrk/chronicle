BEGIN;

-- Catch rows written by the old application after the manual backfill completed.
UPDATE instance_speedruns
SET
    boss_to_boss_start_time = ranked_start_time,
    boss_to_boss_completion_time = ranked_completion_time,
    boss_to_boss_duration_ms = ranked_duration_ms
WHERE boss_to_boss_start_time IS NULL
  AND boss_to_boss_completion_time IS NULL
  AND boss_to_boss_duration_ms IS NULL
  AND ranked_start_time IS NOT NULL
  AND ranked_completion_time IS NOT NULL
  AND ranked_duration_ms IS NOT NULL;

-- Cut ranked timing over from its historical boss-to-boss meaning to the
-- rule-adjusted clear meaning. Existing instances have no special clear rule,
-- so their initial ranked clear timing is identical to raw timing.
UPDATE instance_speedruns
SET
    ranked_start_time = start_time,
    ranked_completion_time = completion_time,
    ranked_duration_ms = duration_ms
WHERE duration_ms >= 0
  AND completion_time >= start_time;

COMMIT;
