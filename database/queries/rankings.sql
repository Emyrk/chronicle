-- name: RankingsInstanceSummaries :many
-- Returns per-instance summary with top 3 players by DPS.
-- Deduplicates by (player_guid, encounter_name, duplicate_group) keeping best DPS.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.*
    FROM encounter_dps_rankings edr
    JOIN log_instances li ON li.id = edr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = edr.realm_id
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
),
instance_stats AS (
    SELECT
        d.instance_name,
        COUNT(*)::bigint AS total_kills
    FROM deduped d
    GROUP BY d.instance_name
),
top_players AS (
    SELECT DISTINCT ON (d.instance_name, rank_num)
        d.instance_name,
        d.player_name,
        d.realm_name,
        d.player_class,
        d.dps,
        ROW_NUMBER() OVER (PARTITION BY d.instance_name ORDER BY d.dps DESC) AS rank_num
    FROM deduped d
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
ORDER BY d.encounter_name;

-- name: RankingsLeaderboard :many
-- Returns paginated DPS rankings, deduplicated and filtered.
-- Supports multi-instance, multi-encounter, time period, realm, class, and spec filters.
WITH deduped AS (
    SELECT DISTINCT ON (edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id))
        edr.id,
        edr.encounter_name,
        edr.instance_name,
        edr.player_guid,
        edr.player_name,
        edr.player_class,
        edr.player_spec,
        edr.player_level,
        edr.realm_id,
        edr.realm_name,
        edr.guild_name,
        edr.damage_done,
        edr.duration_secs,
        edr.dps,
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
        WHEN @since_days :: bigint > 0 THEN edr.killed_at >= now() - make_interval(days => @since_days::int)
        ELSE true
    END
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
)
SELECT
    d.*,
    COUNT(*) OVER() AS total_count
FROM deduped d
ORDER BY d.dps DESC
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
        WHEN @since_days :: bigint > 0 THEN edr.killed_at >= now() - make_interval(days => @since_days::int)
        ELSE true
    END
    ORDER BY edr.player_guid, edr.encounter_name, COALESCE(li.duplicate_group_id, li.id), edr.dps DESC
)
SELECT
    d.player_class,
    d.player_spec,
    MIN(d.dps)::double precision AS min_dps,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY d.dps) AS q1_dps,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY d.dps) AS median_dps,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY d.dps) AS q3_dps,
    MAX(d.dps)::double precision AS max_dps,
    COUNT(*)::bigint AS count
FROM deduped d
GROUP BY d.player_class, d.player_spec
ORDER BY median_dps DESC;
