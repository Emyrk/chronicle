-- name: TouchLogInstanceRankingSource :exec
UPDATE log_instances
SET updated_at = now()
WHERE id = @instance_id;

-- name: RankingRunIdentitiesByInstanceIDs :many
SELECT
    li.id AS instance_id,
    COALESCE(li.duplicate_group_id, li.id) AS run_id
FROM log_instances li
WHERE li.id = ANY(@instance_ids::uuid[])
ORDER BY li.id;

-- name: RankingRunIdentitiesByLogGroupID :many
SELECT
    li.id AS instance_id,
    COALESCE(li.duplicate_group_id, li.id) AS run_id
FROM log_instances li
WHERE li.log_group_id = @log_group_id
ORDER BY li.id;

-- name: RankingRunByID :one
SELECT *
FROM ranking_runs
WHERE run_id = @run_id;

-- name: RankingRunSources :many
WITH affected_runs AS MATERIALIZED (
    SELECT DISTINCT COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM log_instances li
    WHERE li.id = ANY(@affected_ids::uuid[])
       OR li.duplicate_group_id = ANY(@affected_ids::uuid[])
),
members AS MATERIALIZED (
    SELECT
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        li.id,
        li.realm_id,
        li.name AS instance_name,
        li.difficulty_name,
        li.max_players,
        li.start_time,
        li.end_time,
        li.duplicate_group_id,
        li.updated_at AS instance_updated_at,
        COUNT(DISTINCT coverage.encounter_name) FILTER (
            WHERE coverage.encounter_id IS NOT NULL
        )::integer AS boss_coverage
    FROM log_instances li
    LEFT JOIN encounter_dps_rankings coverage ON coverage.instance_id = li.id
    WHERE COALESCE(li.duplicate_group_id, li.id) IN (SELECT run_id FROM affected_runs)
    GROUP BY li.id
),
ranked AS (
    SELECT
        members.*,
        COUNT(*) OVER (PARTITION BY run_id)::integer AS member_count,
        (MAX(instance_updated_at) OVER (PARTITION BY run_id))::timestamptz AS source_updated_at,
        ROW_NUMBER() OVER (
            PARTITION BY run_id
            ORDER BY boss_coverage DESC,
                (id = duplicate_group_id) DESC NULLS LAST,
                start_time ASC,
                id ASC
        ) AS representative_rank
    FROM members
)
SELECT
    run_id,
    id AS representative_instance_id,
    realm_id,
    instance_name,
    difficulty_name,
    max_players,
    start_time,
    end_time,
    boss_coverage,
    member_count,
    source_updated_at
FROM ranked
WHERE representative_rank = 1
ORDER BY run_id;

-- name: UpsertRankingRun :one
INSERT INTO ranking_runs (
    run_id,
    representative_instance_id,
    realm_id,
    instance_name,
    difficulty_name,
    max_players,
    start_time,
    end_time,
    boss_coverage,
    member_count,
    source_updated_at
) VALUES (
    @run_id,
    @representative_instance_id,
    @realm_id,
    @instance_name,
    @difficulty_name,
    @max_players,
    @start_time,
    @end_time,
    @boss_coverage,
    @member_count,
    @source_updated_at
)
ON CONFLICT (run_id) DO UPDATE SET
    representative_instance_id = EXCLUDED.representative_instance_id,
    realm_id = EXCLUDED.realm_id,
    instance_name = EXCLUDED.instance_name,
    difficulty_name = EXCLUDED.difficulty_name,
    max_players = EXCLUDED.max_players,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    boss_coverage = EXCLUDED.boss_coverage,
    member_count = EXCLUDED.member_count,
    source_updated_at = EXCLUDED.source_updated_at,
    updated_at = now()
WHERE (
    ranking_runs.representative_instance_id,
    ranking_runs.realm_id,
    ranking_runs.instance_name,
    ranking_runs.difficulty_name,
    ranking_runs.max_players,
    ranking_runs.start_time,
    ranking_runs.end_time,
    ranking_runs.boss_coverage,
    ranking_runs.member_count,
    ranking_runs.source_updated_at
) IS DISTINCT FROM (
    EXCLUDED.representative_instance_id,
    EXCLUDED.realm_id,
    EXCLUDED.instance_name,
    EXCLUDED.difficulty_name,
    EXCLUDED.max_players,
    EXCLUDED.start_time,
    EXCLUDED.end_time,
    EXCLUDED.boss_coverage,
    EXCLUDED.member_count,
    EXCLUDED.source_updated_at
)
RETURNING (xmax = 0) AS created;

-- name: DeleteConflictingRankingRunRepresentatives :exec
-- Release representative IDs that moved to a different logical run before the
-- state-based refresh upserts all desired rows in arbitrary UUID order.
DELETE FROM ranking_runs existing
USING (
    SELECT
        unnest(sqlc.arg(run_ids)::uuid[]) AS run_id,
        unnest(sqlc.arg(representative_instance_ids)::uuid[]) AS representative_instance_id
) desired
WHERE existing.representative_instance_id = desired.representative_instance_id
  AND existing.run_id <> desired.run_id;

-- name: DeleteObsoleteRankingRuns :many
DELETE FROM ranking_runs
WHERE run_id = ANY(@affected_ids::uuid[])
  AND NOT (run_id = ANY(@resolved_run_ids::uuid[]))
RETURNING run_id;

-- name: RankingRunsNeedingRepair :many
WITH current_runs AS MATERIALIZED (
    SELECT
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        MAX(li.updated_at) AS source_updated_at
    FROM log_instances li
    GROUP BY COALESCE(li.duplicate_group_id, li.id)
)
SELECT
    current_runs.run_id,
    (ranking_runs.run_id IS NULL)::boolean AS missing,
    (ranking_runs.run_id IS NOT NULL
        AND ranking_runs.source_updated_at < current_runs.source_updated_at)::boolean AS stale,
    (ranking_runs.run_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM log_instances representative
        WHERE representative.id = ranking_runs.representative_instance_id
          AND COALESCE(representative.duplicate_group_id, representative.id) = current_runs.run_id
    ))::boolean AS invalid_representative
FROM current_runs
LEFT JOIN ranking_runs ON ranking_runs.run_id = current_runs.run_id
WHERE current_runs.source_updated_at <= @source_cutoff::timestamptz
  AND (
      ranking_runs.run_id IS NULL
      OR ranking_runs.source_updated_at < current_runs.source_updated_at
      OR NOT EXISTS (
          SELECT 1
          FROM log_instances representative
          WHERE representative.id = ranking_runs.representative_instance_id
            AND COALESCE(representative.duplicate_group_id, representative.id) = current_runs.run_id
      )
  )
ORDER BY current_runs.source_updated_at, current_runs.run_id
LIMIT @query_limit;

-- name: RankingRunsNeedingFullScanRepair :many
WITH members AS MATERIALIZED (
    SELECT
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        li.id,
        li.realm_id,
        li.name AS instance_name,
        li.difficulty_name,
        li.max_players,
        li.start_time,
        li.end_time,
        li.duplicate_group_id,
        li.updated_at AS instance_updated_at,
        COUNT(DISTINCT coverage.encounter_name) FILTER (
            WHERE coverage.encounter_id IS NOT NULL
        )::integer AS boss_coverage
    FROM log_instances li
    LEFT JOIN encounter_dps_rankings coverage ON coverage.instance_id = li.id
    GROUP BY li.id
),
ranked AS (
    SELECT
        members.*,
        COUNT(*) OVER (PARTITION BY run_id)::integer AS member_count,
        (MAX(instance_updated_at) OVER (PARTITION BY run_id))::timestamptz AS source_updated_at,
        ROW_NUMBER() OVER (
            PARTITION BY run_id
            ORDER BY boss_coverage DESC,
                (id = duplicate_group_id) DESC NULLS LAST,
                start_time ASC,
                id ASC
        ) AS representative_rank
    FROM members
),
expected AS (
    SELECT * FROM ranked
    WHERE representative_rank = 1
      AND source_updated_at <= @source_cutoff::timestamptz
)
SELECT
    expected.run_id,
    (ranking_runs.run_id IS NULL)::boolean AS missing,
    (ranking_runs.run_id IS NOT NULL AND (
        ranking_runs.source_updated_at < expected.source_updated_at
        OR (
            ranking_runs.realm_id,
            ranking_runs.instance_name,
            ranking_runs.difficulty_name,
            ranking_runs.max_players,
            ranking_runs.start_time,
            ranking_runs.end_time,
            ranking_runs.boss_coverage,
            ranking_runs.member_count
        ) IS DISTINCT FROM (
            expected.realm_id,
            expected.instance_name,
            expected.difficulty_name,
            expected.max_players,
            expected.start_time,
            expected.end_time,
            expected.boss_coverage,
            expected.member_count
        )
    ))::boolean AS stale,
    (ranking_runs.run_id IS NOT NULL
        AND ranking_runs.representative_instance_id <> expected.id)::boolean AS invalid_representative
FROM expected
LEFT JOIN ranking_runs ON ranking_runs.run_id = expected.run_id
WHERE ranking_runs.run_id IS NULL
   OR ranking_runs.representative_instance_id <> expected.id
   OR ranking_runs.source_updated_at < expected.source_updated_at
   OR (
        ranking_runs.realm_id,
        ranking_runs.instance_name,
        ranking_runs.difficulty_name,
        ranking_runs.max_players,
        ranking_runs.start_time,
        ranking_runs.end_time,
        ranking_runs.boss_coverage,
        ranking_runs.member_count
   ) IS DISTINCT FROM (
        expected.realm_id,
        expected.instance_name,
        expected.difficulty_name,
        expected.max_players,
        expected.start_time,
        expected.end_time,
        expected.boss_coverage,
        expected.member_count
   )
ORDER BY expected.source_updated_at, expected.run_id
LIMIT @query_limit;

-- name: OrphanRankingRuns :many
SELECT ranking_runs.run_id
FROM ranking_runs
WHERE NOT EXISTS (
    SELECT 1
    FROM log_instances li
    WHERE COALESCE(li.duplicate_group_id, li.id) = ranking_runs.run_id
)
ORDER BY ranking_runs.updated_at, ranking_runs.run_id
LIMIT @query_limit;
