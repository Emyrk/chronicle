-- name: RankingsInstanceSummaries :many
-- Returns per-instance summary with top 3 players by aggregated DPS.
-- DPS is computed as total damage / total duration across all encounters per player.
-- Deduplicates by (player_guid, encounter_name, duplicate_group) before aggregating.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.instance_name,
        edr.player_guid,
        edr.player_name,
        edr.realm_name,
        edr.player_class,
        edr.player_role,
        edr.damage_done,
        edr.duration_secs,
        edr.dps
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    WHERE edr.dps > 0
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
),
-- Aggregate per player per instance: sum damage across encounters.
per_player AS (
    SELECT
        d.instance_name,
        d.player_guid,
        (array_agg(d.player_name ORDER BY d.damage_done DESC))[1] AS player_name,
        (array_agg(d.realm_name ORDER BY d.damage_done DESC))[1] AS realm_name,
        (array_agg(d.player_class ORDER BY d.damage_done DESC))[1] AS player_class,
        (SUM(d.damage_done)::double precision / NULLIF(SUM(d.duration_secs), 0)) AS dps
    FROM deduped d
    WHERE d.player_role = 'dps'
    GROUP BY d.instance_name, d.player_guid
),
instance_stats AS (
    SELECT
        d.instance_name,
        COUNT(DISTINCT d.player_guid)::bigint AS total_kills
    FROM deduped d
    GROUP BY d.instance_name
),
top_players AS (
    SELECT
        p.instance_name,
        p.player_name,
        p.realm_name,
        p.player_class,
        p.dps,
        ROW_NUMBER() OVER (PARTITION BY p.instance_name ORDER BY p.dps DESC) AS rank_num
    FROM per_player p
    WHERE p.dps > 0
)
SELECT
    s.instance_name,
    s.total_kills,
    COALESCE(
        (SELECT json_agg(json_build_object(
            'player_name', tp.player_name,
            'realm_name', tp.realm_name,
            'player_class', tp.player_class,
            'dps', tp.dps
        ) ORDER BY tp.rank_num)
        FROM top_players tp
        WHERE tp.instance_name = s.instance_name AND tp.rank_num <= 3),
        '[]'::json
    ) AS top_players
FROM instance_stats s
ORDER BY s.instance_name;

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
-- Returns paginated DPS rankings aggregated per player across selected encounters.
-- When multiple encounters are selected, damage and duration are summed per player
-- and DPS is recomputed as total_damage / total_duration.
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
        edr.duration_secs,
        edr.avg_ilvl,
        edr.log_hashed_slug,
        edr.killed_at,
        tb.sub_spec AS talent_sub_spec
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
        WHEN @realm_id :: text != '' THEN edr.realm_id = @realm_id :: uuid
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
    AND edr.dps > 0
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
),
-- Aggregate per player: sum damage and duration across encounters, recompute DPS.
aggregated AS (
    SELECT
        d.player_guid,
        -- Use the values from the row with highest damage for display fields.
        ((array_agg(d.player_name ORDER BY d.damage_done DESC))[1])::text AS player_name,
        ((array_agg(d.player_class ORDER BY d.damage_done DESC))[1])::text AS player_class,
        ((array_agg(d.player_spec ORDER BY d.damage_done DESC))[1])::text AS player_spec,
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
        SUM(d.duration_secs)::double precision AS duration_secs,
        (SUM(d.damage_done)::double precision / NULLIF(SUM(d.duration_secs), 0))::double precision AS dps,
        COALESCE(MAX(d.avg_ilvl), 0)::smallint AS avg_ilvl,
        ((array_agg(d.log_hashed_slug ORDER BY d.damage_done DESC))[1])::text AS log_hashed_slug,
        MAX(d.killed_at)::timestamptz AS killed_at,
        COALESCE(((array_agg(d.talent_sub_spec ORDER BY d.damage_done DESC))[1])::text, '') AS talent_sub_spec
    FROM deduped d
    GROUP BY d.player_guid
)
SELECT
    a.*,
    COUNT(*) OVER() AS total_count
FROM aggregated a
WHERE a.dps > 0
ORDER BY a.dps DESC
LIMIT @query_limit::bigint
OFFSET @query_offset::bigint;

-- name: RankingsBoxPlotStats :many
-- Returns box plot statistics (min, q1, median, q3, max, count) per class/spec.
-- Deduplicated and filtered same as leaderboard.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.player_class,
        edr.player_spec,
        edr.dps
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
        WHEN @realm_id :: text != '' THEN edr.realm_id = @realm_id :: uuid
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
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
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
        d.player_spec,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.dps) AS q1_dps,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY d.dps) AS median_dps,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.dps) AS q3_dps,
        -- Whiskers capped at 1.5×IQR from Q1/Q3 (standard box plot convention).
        -- min_dps = lowest value >= Q1 - 1.5*IQR (or actual min if none below).
        -- max_dps = highest value <= Q3 + 1.5*IQR (or actual max if none above).
        GREATEST(
            MIN(d.dps),
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.dps)
                - 1.5 * (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.dps) - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.dps))
        )::double precision AS min_dps,
        LEAST(
            MAX(d.dps),
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.dps)
                + 1.5 * (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.dps) - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.dps))
        )::double precision AS max_dps,
        COUNT(*)::bigint AS count
    FROM deduped d
    WHERE d.dps > 0
    GROUP BY d.player_class, d.player_spec
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
    log_hashed_slug, killed_at
) VALUES (
    @encounter_id, @instance_id, @encounter_name, @instance_name,
    @player_guid, @player_name, @player_class, @player_spec, @player_role, @player_level,
    @talent_build_id, @difficulty_name, @max_players,
    @realm_id, @realm_name, @guild_id, @guild_name,
    @damage_done, @duration_secs, @dps, @avg_ilvl,
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
        GREATEST(
            MIN(d.duration_secs),
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.duration_secs)
                - 1.5 * (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.duration_secs) - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.duration_secs))
        )::double precision AS min_secs,
        LEAST(
            MAX(d.duration_secs),
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.duration_secs)
                + 1.5 * (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.duration_secs) - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.duration_secs))
        )::double precision AS max_secs,
        COUNT(*)::bigint AS count
    FROM deduped d
    WHERE d.duration_secs > 0
    GROUP BY d.encounter_name
) s
ORDER BY (s.encounter_name = 'Trash'), s.encounter_name;

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
          WHEN @since_days :: bigint > 0 THEN lie.end_time >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
    ORDER BY lie.name, lie.kill_type, COALESCE(li.duplicate_group_id, li.id), lie.end_time DESC
)
SELECT
    d.encounter_name,
    COUNT(*) FILTER (WHERE d.kill_type = 'clean')::bigint AS kills,
    COUNT(*) FILTER (WHERE d.kill_type = 'wipe')::bigint AS wipes,
    COUNT(*)::bigint AS total
FROM deduped d
GROUP BY d.encounter_name
ORDER BY (d.encounter_name = 'Trash'), d.encounter_name;
