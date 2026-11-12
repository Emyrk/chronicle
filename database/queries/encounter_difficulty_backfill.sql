-- Offline repair only. Never call this from startup. Use the last inspected ID
-- as the next cursor, even when updated_count is zero. Each batch inspects at
-- most batch_size primary-key entries, rather than searching an unbounded
-- suffix for NULLs. Existing explicit Normal (empty string) is never overwritten.
-- name: BackfillEncounterDifficultyBatch :one
WITH batch AS MATERIALIZED (
    SELECT id, instance_id, difficulty
    FROM log_instance_encounters
    WHERE id > @after_id::uuid
    ORDER BY id
    LIMIT LEAST(GREATEST(@batch_size::int, 1), 10000)
), updated AS (
    UPDATE log_instance_encounters encounter
    SET difficulty = CASE
        WHEN instance.dynamic_difficulty > 0 OR instance.difficulty_name ILIKE '%heroic%'
        THEN 'heroic' ELSE '' END
    FROM batch
    JOIN log_instances instance ON instance.id = batch.instance_id
    WHERE encounter.id = batch.id AND encounter.difficulty IS NULL
    RETURNING encounter.id
)
SELECT (SELECT id FROM batch ORDER BY id DESC LIMIT 1) AS last_inspected_id,
       (SELECT count(*) FROM batch)::bigint AS inspected_count,
       (SELECT count(*) FROM updated)::bigint AS updated_count;

-- Read-only preview/count of precisely the next bounded batch. Repeat with the
-- cursor to estimate the full rollout without one unbounded table scan.
-- name: PreviewEncounterDifficultyBackfillBatch :one
WITH batch AS MATERIALIZED (
    SELECT id, instance_id, difficulty
    FROM log_instance_encounters
    WHERE id > @after_id::uuid
    ORDER BY id
    LIMIT LEAST(GREATEST(@batch_size::int, 1), 10000)
)
SELECT (SELECT id FROM batch ORDER BY id DESC LIMIT 1) AS last_inspected_id,
       count(*)::bigint AS inspected_count,
       count(*) FILTER (WHERE batch.difficulty IS NULL)::bigint AS pending_count,
       count(*) FILTER (WHERE batch.difficulty IS NULL AND
           (instance.dynamic_difficulty > 0 OR instance.difficulty_name ILIKE '%heroic%'))::bigint AS heroic_count
FROM batch
JOIN log_instances instance ON instance.id = batch.instance_id;
