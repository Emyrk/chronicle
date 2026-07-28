-- name: RankingsInstanceSummaries :many
-- Reads pre-computed per-instance summaries for a specific tenant.
-- The table has no RLS; filtering is done explicitly by tenant_id.
SELECT instance_name, difficulty_name, max_players, total_kills, top_players
FROM rankings_instance_summaries
WHERE tenant_id = @tenant_id
ORDER BY instance_name, difficulty_name, max_players;

-- name: UpsertRankingsInstanceSummary :exec
-- Recompute and upsert the rankings summary for a single
-- (instance, difficulty, max_players, tenant) combo.
-- The caller sets tenant context so RLS on encounter_dps_rankings
-- scopes to the correct realms automatically.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.player_guid, edr.player_name, edr.realm_name,
        edr.player_class, edr.encounter_name,
        edr.damage_done, edr.duration_secs, edr.dps,
        COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    WHERE edr.instance_name = @instance_name
      AND edr.difficulty_name = @difficulty_name
      AND edr.max_players = @max_players
      AND edr.dps > 0
      -- Boss encounters only: trash is excluded from the top-3 preview by default.
      AND edr.encounter_name <> 'Trash'
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
),
instance_encounter_count AS (
    SELECT COUNT(DISTINCT d.encounter_name) AS cnt FROM deduped d
),
-- Step 1: aggregate per player per run (sum encounters within one instance run).
per_run AS (
    SELECT
        d.player_guid,
        d.run_id,
        (array_agg(d.player_name ORDER BY d.damage_done DESC))[1] AS player_name,
        (array_agg(d.realm_name ORDER BY d.damage_done DESC))[1] AS realm_name,
        (array_agg(d.player_class ORDER BY d.damage_done DESC))[1] AS player_class,
        (SUM(d.damage_done)::double precision / NULLIF(SUM(d.duration_secs), 0)) AS dps
    FROM deduped d
    GROUP BY d.player_guid, d.run_id
    HAVING COUNT(DISTINCT d.encounter_name) = (SELECT cnt FROM instance_encounter_count)
),
-- Step 2: pick each player's best run.
per_player AS (
    SELECT DISTINCT ON (pr.player_guid)
        pr.player_guid,
        pr.player_name,
        pr.realm_name,
        pr.player_class,
        pr.dps
    FROM per_run pr
    ORDER BY pr.player_guid, pr.dps DESC
),
stats AS (
    SELECT COUNT(DISTINCT player_guid)::bigint AS total_kills FROM deduped
),
top3 AS (
    SELECT player_name, realm_name, player_class, dps
    FROM per_player WHERE dps > 0
    ORDER BY dps DESC LIMIT 3
)
INSERT INTO rankings_instance_summaries (instance_name, difficulty_name, max_players, tenant_id, total_kills, top_players, last_row_count, query_version, updated_at)
VALUES (
    @instance_name,
    @difficulty_name,
    @max_players,
    @tenant_id,
    (SELECT total_kills FROM stats),
    COALESCE((SELECT json_agg(json_build_object(
        'player_name', t.player_name,
        'realm_name', t.realm_name,
        'player_class', t.player_class,
        'dps', t.dps
    )) FROM top3 t), '[]'::json),
    @last_row_count,
    @query_version,
    now()
)
ON CONFLICT (instance_name, difficulty_name, max_players, tenant_id) DO UPDATE SET
    total_kills = EXCLUDED.total_kills,
    top_players = EXCLUDED.top_players,
    last_row_count = EXCLUDED.last_row_count,
    query_version = EXCLUDED.query_version,
    updated_at = EXCLUDED.updated_at;

-- name: PruneStaleRankingsInstanceSummaries :execrows
-- Removes summary cards whose instance/difficulty/player-count combination no
-- longer has any ranking rows visible to the current tenant context.
DELETE FROM rankings_instance_summaries ris
WHERE ris.tenant_id = @tenant_id
  AND NOT EXISTS (
    SELECT 1
    FROM encounter_dps_rankings edr
    WHERE edr.instance_name = ris.instance_name
      AND edr.difficulty_name = ris.difficulty_name
      AND edr.max_players = ris.max_players
  );

-- name: RankingsDistinctSummaryKeys :many
-- Returns distinct (instance, difficulty, max_players) combos visible to the
-- current tenant context (RLS on encounter_dps_rankings does the filtering).
SELECT DISTINCT instance_name, difficulty_name, max_players
FROM encounter_dps_rankings
ORDER BY instance_name, difficulty_name, max_players;

-- name: RankingsRowCount :one
-- Total row count in encounter_dps_rankings (scoped by tenant RLS).
-- Used as a staleness guard — if count hasn't changed, skip refresh.
SELECT COUNT(*)::bigint AS row_count
FROM encounter_dps_rankings;

-- name: RankingsSummaryLastRowCount :one
-- Returns the last_row_count and minimum query_version stored in the
-- summary table for a tenant. If no summaries exist yet, returns 0
-- for both (forcing a refresh).
SELECT
    COALESCE(MAX(last_row_count), 0)::bigint AS last_row_count,
    COALESCE(MIN(query_version), 0)::smallint AS query_version
FROM rankings_instance_summaries
WHERE tenant_id = @tenant_id;

-- name: RankingsSummaryMaxUpdatedAt :one
-- Most recent updated_at among summaries for a given tenant.
-- Used by the dispatch worker to skip if refreshed recently.
SELECT COALESCE(MAX(updated_at), '1970-01-01'::timestamptz)::timestamptz AS max_updated_at
FROM rankings_instance_summaries
WHERE tenant_id = @tenant_id;

-- name: RankingsEncounterList :many
-- Returns encounters available in rankings for a given instance.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.*
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    WHERE edr.instance_name = @instance_name
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
)
SELECT
    d.encounter_name,
    COUNT(*)::bigint AS total_kills,
    MAX(d.dps)::double precision AS top_dps
FROM deduped d
GROUP BY d.encounter_name
ORDER BY (d.encounter_name = 'Trash'), d.encounter_name;

-- name: RankingsLeaderboard :many
-- Returns paginated DPS rankings showing each player's best single run.
-- A "run" is one instance_id (deduplicated by duplicate_group_id).
-- Within a run, damage and duration are summed across encounters to get run DPS.
-- Each player appears once with their highest-DPS run.
-- Deduplicates by (player, encounter, duplicate_group) before aggregating.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.player_guid,
        edr.player_name,
        edr.player_class,
        edr.player_spec,
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
        tb.sub_spec AS talent_sub_spec,
        tb.talent_layout AS talent_layout,
        COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    LEFT JOIN talent_builds tb ON tb.id = edr.talent_build_id
    WHERE CASE
        WHEN cardinality(@instance_names :: text[]) > 0 THEN edr.instance_name = ANY(@instance_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN cardinality(@encounter_names :: text[]) > 0 THEN edr.encounter_name = ANY(@encounter_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN cardinality(@realm_names :: text[]) > 0 THEN edr.realm_name = ANY(@realm_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN @class :: text != '' THEN edr.player_class = @class
        ELSE true
    END
    AND CASE
        WHEN @spec :: text != '' THEN edr.player_spec = @spec
        ELSE true
    END
    AND CASE
        WHEN @role :: text != '' THEN edr.player_role = @role
        ELSE true
    END
    AND CASE
        WHEN @since_days :: bigint > 0 THEN edr.killed_at >= now() - make_interval(days => @since_days::int)
        ELSE true
    END
    AND CASE
        WHEN @hide_unknowns :: bool THEN edr.player_class != 'Unknown' AND edr.player_spec != 'Unknown'
        ELSE true
    END
    AND CASE
        WHEN cardinality(@difficulty_names :: text[]) > 0 THEN edr.difficulty_name = ANY(@difficulty_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN @filter_max_players :: smallint > 0 THEN edr.max_players = @filter_max_players
        ELSE true
    END
    AND (CASE WHEN @metric :: text = 'hps' THEN edr.hps ELSE edr.dps END) > 0
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id),
        (CASE WHEN @metric :: text = 'hps' THEN edr.hps ELSE edr.dps END) DESC
),
-- Encounter counts are computed per realm: different realms (servers) can
-- record different encounter names for the same instance, so requiring the
-- union across realms would exclude every run when multiple realms are shown.
realm_encounter_counts AS (
    SELECT d.realm_id, COUNT(DISTINCT d.encounter_name) AS encounter_count
    FROM deduped d
    GROUP BY d.realm_id
),
-- Step 1: aggregate per player per run (sum encounters within a single instance run).
per_run AS (
    SELECT
        d.player_guid,
        d.run_id,
        ((array_agg(d.player_name ORDER BY d.damage_done DESC))[1])::text AS player_name,
        ((array_agg(d.player_class ORDER BY d.damage_done DESC))[1])::text AS player_class,
        (string_agg(DISTINCT d.player_spec, '/' ORDER BY d.player_spec))::text AS player_spec,
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
    JOIN realm_encounter_counts rec ON rec.realm_id = d.realm_id
    GROUP BY d.player_guid, d.run_id, rec.encounter_count
    -- Only include runs where player has data for ALL encounters on their realm.
    HAVING COUNT(DISTINCT d.encounter_name) = rec.encounter_count
),
-- Step 2: pick each player's best run.
aggregated AS (
    SELECT DISTINCT ON (pr.player_guid)
        pr.player_guid,
        pr.player_name,
        pr.player_class,
        pr.player_spec,
        pr.player_role,
        pr.player_level,
        pr.instance_name,
        pr.encounter_name,
        pr.difficulty_name,
        pr.max_players,
        pr.realm_id,
        pr.realm_name,
        pr.guild_name,
        pr.damage_done,
        pr.healing_done,
        pr.absorbed_done,
        pr.duration_secs,
        pr.dps,
        pr.hps,
        pr.avg_ilvl,
        pr.log_hashed_slug,
        pr.killed_at,
        pr.talent_sub_spec,
        pr.talent_layout
    FROM per_run pr
    ORDER BY pr.player_guid, (CASE WHEN @metric :: text = 'hps' THEN pr.hps ELSE pr.dps END) DESC
)
SELECT
    a.*,
    COUNT(*) OVER() AS total_count
FROM aggregated a
WHERE (CASE WHEN @metric :: text = 'hps' THEN a.hps ELSE a.dps END) > 0
ORDER BY (CASE WHEN @metric :: text = 'hps' THEN a.hps ELSE a.dps END) DESC
LIMIT @query_limit::bigint
OFFSET @query_offset::bigint;

-- name: RankingsBoxPlotStats :many
-- Returns box plot statistics (min, q1, median, q3, max, count) per class/spec.
-- DPS is aggregated per run (sum damage / sum duration across encounters in one
-- instance run), so each run is one data point. Matches leaderboard aggregation.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.player_guid,
        edr.encounter_name,
        edr.player_class,
        edr.player_spec,
        edr.realm_id,
        edr.damage_done,
        edr.healing_done,
        edr.absorbed_done,
        edr.duration_secs,
        COALESCE(li.duplicate_group_id, li.id) AS run_id
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    WHERE CASE
        WHEN cardinality(@instance_names :: text[]) > 0 THEN edr.instance_name = ANY(@instance_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN cardinality(@encounter_names :: text[]) > 0 THEN edr.encounter_name = ANY(@encounter_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN cardinality(@realm_names :: text[]) > 0 THEN edr.realm_name = ANY(@realm_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN @role :: text != '' THEN edr.player_role = @role
        ELSE true
    END
    AND CASE
        WHEN @since_days :: bigint > 0 THEN edr.killed_at >= now() - make_interval(days => @since_days::int)
        ELSE true
    END
    AND CASE
        WHEN cardinality(@difficulty_names :: text[]) > 0 THEN edr.difficulty_name = ANY(@difficulty_names :: text[])
        ELSE true
    END
    AND CASE
        WHEN @filter_max_players :: smallint > 0 THEN edr.max_players = @filter_max_players
        ELSE true
    END
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id),
        (CASE WHEN @metric :: text = 'hps' THEN edr.hps ELSE edr.dps END) DESC
),
-- Encounter counts are computed per realm: different realms (servers) can
-- record different encounter names for the same instance, so requiring the
-- union across realms would exclude every run when multiple realms are shown.
realm_encounter_counts AS (
    SELECT d.realm_id, COUNT(DISTINCT d.encounter_name) AS encounter_count
    FROM deduped d
    GROUP BY d.realm_id
),
-- Aggregate per player per run: sum damage/duration across encounters in one run.
-- Each run becomes one data point for percentile computation.
-- Only include runs where the player completed ALL encounters as the same spec.
per_run AS (
    SELECT
        d.player_class,
        d.player_spec,
        (CASE WHEN @metric :: text = 'hps'
            THEN SUM(d.healing_done + d.absorbed_done)::double precision / NULLIF(SUM(d.duration_secs), 0)
            ELSE SUM(d.damage_done)::double precision / NULLIF(SUM(d.duration_secs), 0)
        END)::double precision AS metric_value
    FROM deduped d
    JOIN realm_encounter_counts rec ON rec.realm_id = d.realm_id
    GROUP BY d.player_guid, d.run_id, d.player_class, d.player_spec, rec.encounter_count
    HAVING COUNT(DISTINCT d.encounter_name) = rec.encounter_count
)
SELECT
    s.player_class,
    s.player_spec,
    s.min_dps,
    s.q1_dps,
    s.median_dps,
    s.q3_dps,
    s.max_dps,
    s.count
FROM (
    SELECT
        d.player_class,
        (CASE WHEN @group_by_class :: bool THEN '' ELSE d.player_spec END)::text AS player_spec,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.metric_value) AS q1_dps,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY d.metric_value) AS median_dps,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.metric_value) AS q3_dps,
        -- When we have enough samples, trim the bottom 5% to exclude
        -- outliers (e.g. early deaths). Otherwise show the true minimum.
        CASE WHEN COUNT(*) > 100
            THEN PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY d.metric_value)
            ELSE MIN(d.metric_value)
        END::double precision AS min_dps,
        MAX(d.metric_value)::double precision AS max_dps,
        COUNT(*)::bigint AS count
    FROM per_run d
    WHERE d.metric_value > 0
    GROUP BY d.player_class, (CASE WHEN @group_by_class :: bool THEN '' ELSE d.player_spec END)::text
) s
ORDER BY s.median_dps DESC;

-- name: UpsertTalentBuild :one
-- Insert a unique talent build, returning its ID. If the build already exists,
-- return the existing row's ID.
WITH ins AS (
    INSERT INTO talent_builds (player_class, talent_summary, talent_layout, spec)
    VALUES (@player_class, @talent_summary, @talent_layout, @spec)
    ON CONFLICT (player_class, talent_layout) DO NOTHING
    RETURNING id
)
SELECT id FROM ins
UNION ALL
SELECT id FROM talent_builds WHERE player_class = @player_class AND talent_layout = @talent_layout
LIMIT 1;

-- name: InsertEncounterDpsRanking :exec
INSERT INTO encounter_dps_rankings (
    encounter_id, instance_id, encounter_name, instance_name,
    player_guid, player_name, player_class, player_spec, player_role, player_level,
    talent_build_id, difficulty_name, max_players,
    realm_id, realm_name, guild_id, guild_name,
    damage_done, duration_secs, dps, avg_ilvl,
    healing_done, absorbed_done, hps,
    log_hashed_slug, killed_at
) VALUES (
    @encounter_id, @instance_id, @encounter_name, @instance_name,
    @player_guid, @player_name, @player_class, @player_spec, @player_role, @player_level,
    @talent_build_id, @difficulty_name, @max_players,
    @realm_id, @realm_name, @guild_id, @guild_name,
    @damage_done, @duration_secs, @dps, @avg_ilvl,
    @healing_done, @absorbed_done, @hps,
    @log_hashed_slug, @killed_at
) ON CONFLICT (encounter_id, player_guid) DO NOTHING;

-- name: RankingsKillTimeStats :many
-- Box plot stats on encounter duration (seconds) per encounter name.
-- Deduplicates encounters across duplicate log groups.
WITH deduped AS (
    SELECT DISTINCT ON (lie.name, COALESCE(li.duplicate_group_id, li.id))
        lie.name AS encounter_name,
        EXTRACT(EPOCH FROM (lie.end_time - lie.start_time))::double precision AS duration_secs
    FROM log_instance_encounters lie
    JOIN log_instances li ON li.id = lie.instance_id
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    WHERE li.name = @instance_name
      AND lie.boss = true
      AND lie.kill_type = 'clean'
      AND CASE
          WHEN @since_days :: bigint > 0 THEN lie.end_time >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
    ORDER BY lie.name, COALESCE(li.duplicate_group_id, li.id), lie.end_time DESC
)
SELECT
    s.encounter_name,
    s.min_secs,
    s.q1_secs,
    s.median_secs,
    s.q3_secs,
    s.max_secs,
    s.count
FROM (
    SELECT
        d.encounter_name,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.duration_secs) AS q1_secs,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY d.duration_secs) AS median_secs,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.duration_secs) AS q3_secs,
        MIN(d.duration_secs)::double precision AS min_secs,
        MAX(d.duration_secs)::double precision AS max_secs,
        COUNT(*)::bigint AS count
    FROM deduped d
    WHERE d.duration_secs > 0
    GROUP BY d.encounter_name
) s
ORDER BY (s.encounter_name = 'Trash'), s.encounter_name;

-- name: RankingsKillTimeLeaderboard :many
-- Paginated leaderboard of fastest encounter kills, ordered by duration.
-- Deduplicates encounters across duplicate log groups (keeps fastest per group).
WITH deduped AS (
    SELECT DISTINCT ON (lie.name, COALESCE(li.duplicate_group_id, li.id))
        lie.id AS encounter_id,
        lie.name AS encounter_name,
        li.id AS instance_id,
        li.hashed_slug AS log_hashed_slug,
        li.name AS instance_name,
        COALESCE(g.name, '')::text AS guild_name,
        wsr.name AS realm_name,
        EXTRACT(EPOCH FROM (lie.end_time - lie.start_time))::double precision AS duration_secs,
        lie.end_time AS killed_at
    FROM log_instance_encounters lie
    JOIN log_instances li ON li.id = lie.instance_id
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    LEFT JOIN guilds g ON g.id = li.guild_id
    WHERE li.name = @instance_name
      AND lie.boss = true
      AND lie.kill_type = 'clean'
      AND CASE
          WHEN @encounter_name :: text != '' THEN lie.name = @encounter_name
          ELSE true
      END
      AND CASE
          WHEN @since_days :: bigint > 0 THEN lie.end_time >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
    ORDER BY lie.name, COALESCE(li.duplicate_group_id, li.id),
             EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) ASC
)
SELECT
    d.encounter_id,
    d.encounter_name,
    d.instance_id,
    d.log_hashed_slug,
    d.instance_name,
    d.guild_name,
    d.realm_name,
    d.duration_secs,
    d.killed_at,
    COUNT(*) OVER() AS total_count
FROM deduped d
WHERE d.duration_secs > 0
ORDER BY d.duration_secs ASC
LIMIT @query_limit::bigint OFFSET @query_offset::bigint;

-- name: RankingsSuccessRates :many
-- Kill/wipe/total counts per encounter name within an instance.
-- Deduplicates across duplicate log groups.
WITH deduped AS (
    SELECT DISTINCT ON (lie.name, lie.kill_type, COALESCE(li.duplicate_group_id, li.id))
        lie.name AS encounter_name,
        lie.kill_type,
        lie.boss
    FROM log_instance_encounters lie
    JOIN log_instances li ON li.id = lie.instance_id
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    WHERE li.name = @instance_name
      AND lie.boss = true
      AND CASE
          WHEN cardinality(@difficulty_names :: text[]) > 0 THEN li.difficulty_name = ANY(@difficulty_names :: text[])
          ELSE true
      END
      AND CASE
          WHEN @filter_max_players :: smallint > 0 THEN li.max_players = @filter_max_players
          ELSE true
      END
      AND CASE
          WHEN @since_days :: bigint > 0 THEN lie.end_time >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
    ORDER BY lie.name, lie.kill_type, COALESCE(li.duplicate_group_id, li.id), lie.end_time DESC
)
SELECT
    d.encounter_name,
    COUNT(*) FILTER (WHERE d.kill_type IN ('clean', 'partial'))::bigint AS kills,
    COUNT(*) FILTER (WHERE d.kill_type IN ('wipe', 'reset'))::bigint AS wipes,
    COUNT(*)::bigint AS total
FROM deduped d
GROUP BY d.encounter_name
ORDER BY (d.encounter_name = 'Trash'), d.encounter_name;


-- name: RankingsRealmNames :many
-- Distinct realm names that have DPS ranking data, for the realm filter dropdown.
-- Rows with an empty realm name are excluded: they cannot be filtered on, and
-- selecting "all realms" must collapse to no filter so those rows still appear.
SELECT DISTINCT edr.realm_name
FROM encounter_dps_rankings edr
JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
WHERE edr.realm_name <> ''
ORDER BY edr.realm_name;

-- name: HasInstanceDpsRankings :one
SELECT EXISTS(
    SELECT 1 FROM encounter_dps_rankings WHERE instance_id = @instance_id
) AS has_rankings;
