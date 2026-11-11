BEGIN;

-- Eye of Eternity remains eligible for Renown, but its two reviewed Wrath
-- variants no longer contribute to overall career Mastery or Peak. This
-- updates two shared configuration rows and queues bounded async refreshes;
-- it does not scan historical evidence during startup.
WITH changed AS (
    UPDATE leaderboard_career_variants c
    SET include_average = false, weight = NULL
    FROM (VALUES
        ('10 Player'::text, 10::smallint, 1::double precision),
        ('25 Player'::text, 25::smallint, 1.5::double precision)
    ) AS previous(difficulty_name, max_players, weight)
    WHERE c.instance_name = 'Eye of Eternity'
      AND (c.difficulty_name, c.max_players) = (previous.difficulty_name, previous.max_players)
      AND c.include_average
      AND c.include_renown
      AND c.weight = previous.weight
    RETURNING 1
)
INSERT INTO leaderboard_dirty_careers (tenant_id, process_after)
SELECT id, clock_timestamp() + interval '30 seconds'
FROM tenants
WHERE EXISTS (SELECT 1 FROM changed)
ON CONFLICT (tenant_id) DO UPDATE SET
    required = true,
    revision = leaderboard_dirty_careers.revision + 1,
    dirtied_at = CASE
        WHEN leaderboard_dirty_careers.required THEN leaderboard_dirty_careers.dirtied_at
        ELSE clock_timestamp()
    END,
    process_after = CASE
        WHEN leaderboard_dirty_careers.required THEN LEAST(
            leaderboard_dirty_careers.dirtied_at + interval '5 minutes',
            clock_timestamp() + interval '30 seconds'
        )
        ELSE clock_timestamp() + interval '30 seconds'
    END;

COMMIT;
