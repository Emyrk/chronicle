-- name: RankingRunSummaryDirtyStatus :one
SELECT
    COUNT(*)::bigint AS queue_depth,
    MIN(updated_at)::timestamptz AS oldest_updated_at,
    now()::timestamptz AS observed_at
FROM ranking_run_summary_dirty;

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
