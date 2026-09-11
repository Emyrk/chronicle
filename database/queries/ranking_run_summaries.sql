-- name: RankingRunSummaryDirtyStatus :one
SELECT
    COUNT(*)::bigint AS queue_depth,
    MIN(updated_at)::timestamptz AS oldest_updated_at,
    now()::timestamptz AS observed_at
FROM ranking_run_summary_dirty;

-- name: RankingRunSummaryBackfillStatus :one
-- Cross-tenant status for the admin repair controls. A single source scan derives
-- the logical runs; dirty age is measured in seconds for stable SDK serialization.
WITH logical_runs AS MATERIALIZED (
    SELECT DISTINCT COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
),
summary_counts AS (
    SELECT
        COUNT(*)::bigint AS logical_run_count,
        COUNT(*) FILTER (WHERE rr.run_id IS NOT NULL AND rr.summary_version = @summary_version::smallint)::bigint AS current_run_count,
        COUNT(*) FILTER (WHERE rr.run_id IS NULL)::bigint AS missing_run_count,
        COUNT(*) FILTER (WHERE rr.run_id IS NOT NULL AND rr.summary_version <> @summary_version::smallint)::bigint AS stale_run_count
    FROM logical_runs lr
    LEFT JOIN ranking_runs rr ON rr.run_id = lr.run_id
),
dirty_status AS (
    SELECT
        COUNT(*)::bigint AS dirty_run_count,
        MIN(updated_at)::timestamptz AS oldest_dirty_at,
        COALESCE(EXTRACT(EPOCH FROM (now() - MIN(updated_at))), 0)::double precision AS oldest_dirty_age_seconds
    FROM ranking_run_summary_dirty
)
SELECT
    sc.logical_run_count,
    sc.current_run_count,
    sc.missing_run_count,
    sc.stale_run_count,
    ds.dirty_run_count,
    ds.oldest_dirty_at,
    ds.oldest_dirty_age_seconds
FROM summary_counts sc
CROSS JOIN dirty_status ds;

-- name: ListDirtyRankingRuns :many
-- Returns a bounded, stable batch without locking dirty rows. Rebuilds may be
-- expensive, so workers observe the generation and conditionally clear it only
-- after the replacement transaction commits.
SELECT run_id, generation
FROM ranking_run_summary_dirty
ORDER BY updated_at ASC, run_id ASC
LIMIT @batch_size;

-- name: RankingRunSummarySource :many
-- Resolves the current representative physical instance for one logical run using
-- the exact ordering from RankingsLeaderboardSlow, then aggregates one row per
-- player across that representative instance's encounters.
WITH representative_instance AS (
    SELECT
        li.id AS representative_instance_id,
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        ws.tenant_id,
        li.name AS instance_name,
        li.realm_id,
        wsr.name AS realm_name,
        li.difficulty_name,
        li.max_players::smallint AS max_players,
        (SELECT COUNT(DISTINCT coverage.encounter_name)
         FROM encounter_dps_rankings coverage
         WHERE coverage.instance_id = li.id
           AND coverage.encounter_id IS NOT NULL)::integer AS boss_coverage
    FROM log_instances li
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    JOIN wow_servers ws ON ws.id = wsr.server_id
    WHERE COALESCE(li.duplicate_group_id, li.id) = @run_id::uuid
    ORDER BY
        (SELECT COUNT(DISTINCT coverage.encounter_name)
         FROM encounter_dps_rankings coverage
         WHERE coverage.instance_id = li.id
           AND coverage.encounter_id IS NOT NULL) DESC,
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
    LIMIT 1
),
deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name)
        edr.player_guid,
        edr.player_name,
        edr.player_class,
        edr.player_spec,
        edr.player_sub_spec,
        edr.player_role,
        edr.player_level,
        edr.instance_name,
        edr.encounter_name,
        edr.difficulty_name,
        edr.max_players,
        edr.realm_id,
        edr.realm_name,
        edr.guild_name,
        edr.damage_done,
        edr.healing_done,
        edr.absorbed_done,
        edr.duration_secs,
        edr.avg_ilvl,
        edr.log_hashed_slug,
        edr.killed_at,
        COALESCE(tb.sub_spec, '')::text AS talent_sub_spec,
        COALESCE(tb.talent_layout, '')::text AS talent_layout
    FROM encounter_dps_rankings edr
    JOIN representative_instance ri ON ri.representative_instance_id = edr.instance_id
    LEFT JOIN talent_builds tb ON tb.id = edr.talent_build_id
    ORDER BY edr.player_guid, edr.encounter_name, edr.dps DESC
),
realm_encounter_count AS (
    SELECT realm_id, COUNT(DISTINCT encounter_name) AS encounter_count
    FROM deduped
    GROUP BY realm_id
),
per_player AS (
    SELECT
        d.player_guid,
        ((array_agg(d.player_name ORDER BY d.damage_done DESC))[1])::text AS player_name,
        ((array_agg(d.player_class ORDER BY d.damage_done DESC))[1])::text AS player_class,
        (string_agg(DISTINCT d.player_spec, '/' ORDER BY d.player_spec))::text AS player_spec,
        (string_agg(DISTINCT d.player_sub_spec, '/' ORDER BY d.player_sub_spec))::text AS player_sub_spec,
        ((array_agg(d.player_role ORDER BY d.damage_done DESC))[1])::text AS player_role,
        MAX(d.player_level)::smallint AS player_level,
        ((array_agg(d.instance_name ORDER BY d.damage_done DESC))[1])::text AS instance_name,
        ((array_agg(d.encounter_name ORDER BY d.damage_done DESC))[1])::text AS encounter_name,
        ((array_agg(d.difficulty_name ORDER BY d.damage_done DESC))[1])::text AS difficulty_name,
        MAX(d.max_players)::smallint AS max_players,
        ((array_agg(d.realm_id ORDER BY d.damage_done DESC))[1])::uuid AS realm_id,
        ((array_agg(d.realm_name ORDER BY d.damage_done DESC))[1])::text AS realm_name,
        ((array_agg(d.guild_name ORDER BY d.damage_done DESC))[1])::text AS guild_name,
        SUM(d.damage_done)::bigint AS damage_done,
        SUM(d.healing_done)::bigint AS healing_done,
        SUM(d.absorbed_done)::bigint AS absorbed_done,
        SUM(d.duration_secs)::double precision AS duration_secs,
        (SUM(d.damage_done)::double precision / NULLIF(SUM(d.duration_secs), 0))::double precision AS dps,
        (SUM(d.healing_done + d.absorbed_done)::double precision / NULLIF(SUM(d.duration_secs), 0))::double precision AS hps,
        COALESCE(MAX(d.avg_ilvl), 0)::smallint AS avg_ilvl,
        ((array_agg(d.log_hashed_slug ORDER BY d.damage_done DESC))[1])::text AS log_hashed_slug,
        MAX(d.killed_at)::timestamptz AS killed_at,
        COALESCE((array_agg(d.talent_sub_spec ORDER BY d.damage_done DESC))[1], '')::text AS talent_sub_spec,
        COALESCE((array_agg(d.talent_layout ORDER BY d.damage_done DESC))[1], '')::text AS talent_layout
    FROM deduped d
    JOIN realm_encounter_count rec ON rec.realm_id = d.realm_id
    GROUP BY d.player_guid, rec.encounter_count
    HAVING COUNT(DISTINCT d.encounter_name) = rec.encounter_count
)
SELECT
    ri.representative_instance_id,
    ri.run_id,
    ri.tenant_id,
    ri.instance_name AS run_instance_name,
    ri.realm_id AS run_realm_id,
    ri.realm_name AS run_realm_name,
    ri.difficulty_name AS run_difficulty_name,
    ri.max_players AS run_max_players,
    ri.boss_coverage,
    COALESCE((SELECT array_agg(DISTINCT d.encounter_name ORDER BY d.encounter_name) FROM deduped d), '{}')::text[] AS encounter_names,
    pp.player_guid,
    pp.player_name,
    pp.player_class,
    pp.player_spec,
    pp.player_sub_spec,
    pp.player_role,
    pp.player_level,
    pp.instance_name,
    pp.encounter_name,
    pp.difficulty_name,
    pp.max_players,
    pp.realm_id,
    pp.realm_name,
    pp.guild_name,
    pp.damage_done,
    pp.healing_done,
    pp.absorbed_done,
    pp.duration_secs,
    pp.dps,
    pp.hps,
    pp.avg_ilvl,
    pp.log_hashed_slug,
    pp.killed_at,
    pp.talent_sub_spec,
    pp.talent_layout
FROM representative_instance ri
JOIN per_player pp ON true
ORDER BY pp.player_guid;

-- name: RankingsLeaderboardFastEligibility :one
-- Checks whether the requested leaderboard can be answered exactly from the
-- current per-run projection. tenant_id is an explicit pruning predicate when a
-- tenant context exists; realm/server RLS remains the authorization boundary.
WITH source_runs AS MATERIALIZED (
    SELECT DISTINCT
        COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    JOIN wow_servers ws ON ws.id = wsr.server_id
    WHERE (NOT @filter_tenant::boolean OR ws.tenant_id = @tenant_id::uuid)
      AND (COALESCE(cardinality(@instance_names::text[]), 0) = 0 OR edr.instance_name = ANY(@instance_names::text[]))
      AND (COALESCE(cardinality(@realm_names::text[]), 0) = 0 OR edr.realm_name = ANY(@realm_names::text[]))
      AND (COALESCE(cardinality(@difficulty_names::text[]), 0) = 0 OR edr.difficulty_name = ANY(@difficulty_names::text[]))
      AND (@filter_max_players::smallint <= 0 OR edr.max_players = @filter_max_players::smallint)
),
matching_summaries AS MATERIALIZED (
    SELECT rr.*
    FROM ranking_runs rr
    WHERE (NOT @filter_tenant::boolean OR rr.tenant_id = @tenant_id::uuid)
      AND (COALESCE(cardinality(@instance_names::text[]), 0) = 0 OR rr.instance_name = ANY(@instance_names::text[]))
      AND (COALESCE(cardinality(@realm_names::text[]), 0) = 0 OR rr.realm_name = ANY(@realm_names::text[]))
      AND (COALESCE(cardinality(@difficulty_names::text[]), 0) = 0 OR rr.difficulty_name = ANY(@difficulty_names::text[]))
      AND (@filter_max_players::smallint <= 0 OR rr.max_players = @filter_max_players::smallint)
),
requested_encounters AS (
    SELECT COALESCE(array_agg(DISTINCT encounter_name ORDER BY encounter_name), '{}')::text[] AS names
    FROM unnest(@encounter_names::text[]) encounter_name
),
realm_encounters AS (
    SELECT
        ms.realm_id,
        COALESCE(array_agg(DISTINCT encounter_name ORDER BY encounter_name), '{}')::text[] AS names
    FROM matching_summaries ms
    CROSS JOIN LATERAL unnest(ms.encounter_names) encounter_name
    WHERE ms.run_id IN (SELECT run_id FROM source_runs)
    GROUP BY ms.realm_id
),
all_encounters AS (
    SELECT COALESCE(array_agg(DISTINCT encounter_name ORDER BY encounter_name), '{}')::text[] AS names
    FROM realm_encounters re
    CROSS JOIN LATERAL unnest(re.names) encounter_name
)
SELECT
    (SELECT COUNT(*) FROM source_runs)::bigint AS source_run_count,
    (SELECT COUNT(*)
     FROM source_runs sr
     LEFT JOIN matching_summaries ms ON ms.run_id = sr.run_id
     WHERE ms.run_id IS NULL)::bigint AS missing_run_count,
    (SELECT COUNT(*)
     FROM matching_summaries ms
     JOIN source_runs sr ON sr.run_id = ms.run_id
     WHERE ms.summary_version <> @summary_version::smallint)::bigint AS stale_run_count,
    (SELECT COUNT(*)
     FROM ranking_player_run_summaries rprs
     JOIN source_runs sr ON sr.run_id = rprs.run_id
     WHERE rprs.summary_version <> @summary_version::smallint)::bigint AS stale_player_count,
    (SELECT COUNT(*)
     FROM matching_summaries ms
     LEFT JOIN source_runs sr ON sr.run_id = ms.run_id
     WHERE sr.run_id IS NULL)::bigint AS orphan_run_count,
    (SELECT COUNT(*)
     FROM ranking_run_summary_dirty dirty
     WHERE dirty.run_id IN (
         SELECT run_id FROM source_runs
         UNION
         SELECT run_id FROM matching_summaries
     ))::bigint AS dirty_run_count,
    (SELECT COUNT(*)
     FROM matching_summaries ms
     JOIN source_runs sr ON sr.run_id = ms.run_id
     JOIN realm_encounters re ON re.realm_id = ms.realm_id
     WHERE ms.encounter_names <> re.names)::bigint AS nonstandard_run_count,
    COALESCE(
        (SELECT COUNT(*) FROM source_runs) = 0
        OR (SELECT names FROM requested_encounters) = (SELECT names FROM all_encounters),
        false
    )::boolean AS encounters_match;

-- name: RankingsLeaderboardFast :many
-- Summary-backed equivalent of RankingsLeaderboardSlow. Eligibility must be
-- checked first so every selected run represents the complete standard encounter
-- set and every projection row is current and clean.
WITH filtered AS (
    SELECT rprs.*
    FROM ranking_player_run_summaries rprs
    JOIN ranking_runs rr ON rr.run_id = rprs.run_id
    WHERE (NOT @filter_tenant::boolean OR rprs.tenant_id = @tenant_id::uuid)
      AND rr.summary_version = @summary_version::smallint
      AND rprs.summary_version = @summary_version::smallint
      AND (COALESCE(cardinality(@instance_names::text[]), 0) = 0 OR rprs.instance_name = ANY(@instance_names::text[]))
      AND (COALESCE(cardinality(@realm_names::text[]), 0) = 0 OR rprs.realm_name = ANY(@realm_names::text[]))
      AND (COALESCE(cardinality(@difficulty_names::text[]), 0) = 0 OR rprs.difficulty_name = ANY(@difficulty_names::text[]))
      AND (@filter_max_players::smallint <= 0 OR rprs.max_players = @filter_max_players::smallint)
      AND (@class::text = '' OR rprs.player_class = @class::text)
      AND (@spec::text = '' OR rprs.player_spec = @spec::text)
      AND (@sub_spec::text = '' OR rprs.player_sub_spec = @sub_spec::text)
      AND (@role::text = '' OR rprs.player_role = @role::text)
      AND (NOT @hide_unknowns::boolean OR (rprs.player_class <> 'Unknown' AND rprs.player_spec <> 'Unknown'))
      AND (CASE WHEN @metric::text = 'hps' THEN rprs.hps ELSE rprs.dps END) > 0
),
best_per_player AS (
    SELECT DISTINCT ON (f.player_guid)
        f.player_guid,
        f.player_name,
        f.player_class,
        f.player_spec,
        f.player_sub_spec,
        f.player_role,
        f.player_level,
        f.instance_name,
        f.encounter_name,
        f.difficulty_name,
        f.max_players,
        f.realm_id,
        f.realm_name,
        f.guild_name,
        f.damage_done,
        f.healing_done,
        f.absorbed_done,
        f.duration_secs,
        f.dps,
        f.hps,
        f.avg_ilvl,
        f.log_hashed_slug,
        f.killed_at,
        f.talent_sub_spec,
        f.talent_layout
    FROM filtered f
    ORDER BY f.player_guid, (CASE WHEN @metric::text = 'hps' THEN f.hps ELSE f.dps END) DESC
)
SELECT
    bpp.*,
    COUNT(*) OVER() AS total_count
FROM best_per_player bpp
ORDER BY (CASE WHEN @metric::text = 'hps' THEN bpp.hps ELSE bpp.dps END) DESC
LIMIT @query_limit::bigint
OFFSET @query_offset::bigint;

-- name: DeleteRankingRunSummary :exec
DELETE FROM ranking_runs WHERE run_id = @run_id;

-- name: InsertRankingRunSummary :exec
INSERT INTO ranking_runs (
    run_id, representative_instance_id, tenant_id, instance_name, realm_id,
    realm_name, difficulty_name, max_players, boss_coverage, encounter_names,
    summary_version, source_generation, updated_at
) VALUES (
    @run_id, @representative_instance_id, @tenant_id, @instance_name, @realm_id,
    @realm_name, @difficulty_name, @max_players, @boss_coverage, @encounter_names,
    @summary_version, @source_generation, now()
);

-- name: InsertRankingPlayerRunSummary :exec
INSERT INTO ranking_player_run_summaries (
    run_id, tenant_id, player_guid, player_name, player_class, player_spec,
    player_sub_spec, player_role, player_level, instance_name, encounter_name,
    difficulty_name, max_players, realm_id, realm_name, guild_name, damage_done,
    healing_done, absorbed_done, duration_secs, dps, hps, avg_ilvl,
    log_hashed_slug, killed_at, talent_sub_spec, talent_layout, summary_version,
    updated_at
) VALUES (
    @run_id, @tenant_id, @player_guid, @player_name, @player_class, @player_spec,
    @player_sub_spec, @player_role, @player_level, @instance_name, @encounter_name,
    @difficulty_name, @max_players, @realm_id, @realm_name, @guild_name, @damage_done,
    @healing_done, @absorbed_done, @duration_secs, @dps, @hps, @avg_ilvl,
    @log_hashed_slug, @killed_at, @talent_sub_spec, @talent_layout, @summary_version,
    now()
);

-- name: GetRankingRunSummary :one
SELECT * FROM ranking_runs WHERE run_id = @run_id;

-- name: ListRankingPlayerRunSummaries :many
SELECT *
FROM ranking_player_run_summaries
WHERE run_id = @run_id
ORDER BY player_guid;

-- name: ClearDirtyRankingRunGeneration :execrows
DELETE FROM ranking_run_summary_dirty
WHERE run_id = @run_id AND generation = @generation;

-- name: SetLocalRankingSummaryBackfillStatementTimeout :exec
SET LOCAL statement_timeout = '10s';

-- name: PreviewRankingSummaryBackfill :one
WITH ranking_instances AS MATERIALIZED (
    SELECT
        li.id AS instance_id,
        COALESCE(li.duplicate_group_id, li.id) AS run_id,
        ws.tenant_id,
        COUNT(edr.*)::bigint AS source_rows
    FROM log_instances li
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    JOIN wow_servers ws ON ws.id = wsr.server_id
    LEFT JOIN encounter_dps_rankings edr ON edr.instance_id = li.id
    GROUP BY li.id, li.duplicate_group_id, ws.tenant_id
), selected_runs AS (
    SELECT DISTINCT ri.run_id
    FROM ranking_instances ri
    WHERE ri.source_rows > 0
      AND (@scope_all::boolean OR ri.tenant_id = @tenant_id::uuid)
), logical_runs AS (
    SELECT ri.run_id, SUM(ri.source_rows)::bigint AS source_rows
    FROM ranking_instances ri
    JOIN selected_runs selected ON selected.run_id = ri.run_id
    GROUP BY ri.run_id
), cross_tenant_duplicate_runs AS (
    SELECT ri.run_id
    FROM ranking_instances ri
    JOIN selected_runs selected ON selected.run_id = ri.run_id
    GROUP BY ri.run_id
    HAVING COUNT(DISTINCT ri.tenant_id) > 1
), classified AS (
    SELECT
        lr.run_id,
        lr.source_rows,
        rr.run_id IS NULL AS missing,
        rr.run_id IS NOT NULL AND rr.summary_version < @target_summary_version::smallint AS stale,
        rr.run_id IS NOT NULL AND rr.summary_version >= @target_summary_version::smallint AS current,
        dirty.run_id IS NOT NULL AS dirty
    FROM logical_runs lr
    LEFT JOIN ranking_runs rr ON rr.run_id = lr.run_id
    LEFT JOIN ranking_run_summary_dirty dirty ON dirty.run_id = lr.run_id
)
SELECT
    COUNT(*)::bigint AS total_runs,
    COALESCE(SUM(source_rows), 0)::bigint AS source_rows,
    COUNT(*) FILTER (WHERE missing)::bigint AS missing_runs,
    COUNT(*) FILTER (WHERE stale)::bigint AS stale_runs,
    COUNT(*) FILTER (WHERE current)::bigint AS current_runs,
    COUNT(*) FILTER (WHERE dirty)::bigint AS dirty_runs,
    ((COUNT(*) FILTER (WHERE missing OR stale)) * 65536)::bigint AS estimated_wal_bytes,
    (SELECT COUNT(*) FROM cross_tenant_duplicate_runs)::bigint AS cross_tenant_duplicate_runs
FROM classified;

-- name: CreateRankingSummaryBackfill :one
INSERT INTO ranking_summary_backfills (
    tenant_id, requested_by, target_summary_version, batch_size, max_batches,
    delay_ms, preview_total_runs, preview_source_rows, preview_missing_runs, preview_stale_runs,
    preview_current_runs, preview_dirty_runs, estimated_wal_bytes
) VALUES (
    CASE WHEN @scope_all::boolean THEN NULL ELSE @tenant_id::uuid END,
    @requested_by, @target_summary_version, @batch_size, @max_batches,
    @delay_ms, @preview_total_runs, @preview_source_rows, @preview_missing_runs, @preview_stale_runs,
    @preview_current_runs, @preview_dirty_runs, @estimated_wal_bytes
)
RETURNING *;

-- name: GetRankingSummaryBackfill :one
SELECT * FROM ranking_summary_backfills WHERE id = @id;

-- name: LatestRankingSummaryBackfill :one
SELECT *
FROM ranking_summary_backfills
WHERE (@scope_all::boolean AND tenant_id IS NULL)
   OR (NOT @scope_all::boolean AND tenant_id = @tenant_id::uuid)
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: StartRankingSummaryBackfill :one
UPDATE ranking_summary_backfills
SET status = 'running',
    started_at = COALESCE(started_at, now()),
    batches_completed = CASE WHEN status IN ('paused', 'failed') THEN 0 ELSE batches_completed END,
    completed_at = NULL,
    last_error_at = NULL,
    error_message = NULL
WHERE id = @id AND status IN ('planned', 'paused', 'failed')
RETURNING *;

-- name: PauseRankingSummaryBackfill :one
UPDATE ranking_summary_backfills
SET status = 'paused', started_at = COALESCE(started_at, now())
WHERE id = @id AND status IN ('planned', 'running')
RETURNING *;

-- name: MarkRankingSummaryBackfillBatch :many
WITH plan AS MATERIALIZED (
    SELECT * FROM ranking_summary_backfills
    WHERE ranking_summary_backfills.id = @backfill_id
      AND ranking_summary_backfills.status = 'running'
), logical_runs AS MATERIALIZED (
    SELECT DISTINCT COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    JOIN wow_servers ws ON ws.id = wsr.server_id
    JOIN plan p ON p.tenant_id IS NULL OR p.tenant_id = ws.tenant_id
), candidates AS MATERIALIZED (
    SELECT lr.run_id
    FROM logical_runs lr
    JOIN plan p ON true
    LEFT JOIN ranking_runs rr ON rr.run_id = lr.run_id
    WHERE lr.run_id > p.cursor_run_id
      AND (rr.run_id IS NULL OR rr.summary_version < p.target_summary_version)
    ORDER BY lr.run_id
    LIMIT (SELECT batch_size FROM plan)
), marked AS (
    INSERT INTO ranking_run_summary_dirty (run_id, generation, last_transaction_id, updated_at)
    SELECT run_id, 1, pg_current_xact_id(), now() FROM candidates
    ON CONFLICT (run_id) DO UPDATE SET
        generation = CASE
            WHEN ranking_run_summary_dirty.last_transaction_id = pg_current_xact_id()
                THEN ranking_run_summary_dirty.generation
            ELSE ranking_run_summary_dirty.generation + 1
        END,
        last_transaction_id = pg_current_xact_id(),
        updated_at = now()
    RETURNING run_id
)
SELECT run_id FROM marked ORDER BY run_id;

-- name: AdvanceRankingSummaryBackfill :one
UPDATE ranking_summary_backfills
SET cursor_run_id = @cursor_run_id,
    batches_completed = batches_completed + 1,
    runs_marked_dirty = runs_marked_dirty + @runs_marked_dirty,
    last_progress_at = now(),
    status = CASE
        WHEN @complete::boolean THEN 'completed'
        WHEN batches_completed + 1 >= max_batches THEN 'paused'
        ELSE 'running'
    END,
    completed_at = CASE WHEN @complete::boolean THEN now() ELSE NULL END
WHERE id = @id AND status = 'running'
RETURNING *;

-- name: FailRankingSummaryBackfill :exec
UPDATE ranking_summary_backfills
SET status = 'failed', completed_at = now(), last_error_at = now(), error_message = @error_message
WHERE id = @id AND status = 'running';
