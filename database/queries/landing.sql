-- name: LandingPositionalInstances :many
-- The newest public, listed, finalized instances on the tenant whose log
-- recorded unit positions and that have a boss encounter, for the /start
-- hero's pick. Newest first.
SELECT li.id, li.realm_id
FROM log_instances li
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
  AND NOT wlg.unlisted
WHERE 'unit-position' = ANY(li.capabilities)
  AND li.invalidated_at IS NULL
  AND EXISTS (
      SELECT 1
      FROM log_instance_encounters lie
      WHERE lie.instance_id = li.id
        AND lie.boss
        AND lie.kill_type IN ('clean', 'partial', 'wipe')
  )
ORDER BY COALESCE(li.start_time, wlg.created_at) DESC, li.id DESC
LIMIT @limit_count::int;

-- name: LandingMontageRuns :many
-- The /start montage's candidates: for each instance name on the tenant, its
-- fastest positional runs on the default speedrun board (SpeedrunLeaderboard
-- with full timing: qualified, guilded, meeting the version requirements, one
-- run per duplicate group, each difficulty its own board). Only public,
-- listed, finalized, valid runs whose log recorded unit positions are
-- returned, up to @per_instance per instance name, best first. speedrun_rank
-- is the place the run's time takes on its board: one more than the other
-- guilds whose best run there is faster.
WITH board AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        sr.instance_id,
        sr.instance_name,
        li.difficulty_name,
        sr.guild_id,
        li.realm_id,
        COALESCE(sr.ranked_duration_ms, sr.duration_ms)::bigint AS duration_ms,
        li.capabilities,
        li.log_group_id,
        li.invalidated_at
    FROM instance_speedruns sr
    JOIN log_instances li ON li.id = sr.instance_id
    JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
    JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
    LEFT JOIN leaderboard_version_requirements lvr ON lvr.instance_name = sr.instance_name
    WHERE sr.qualified = true
      AND sr.guild_id IS NOT NULL
      AND sr.parser_version_num >= COALESCE(lvr.min_parser_version_num, 0)
      AND sr.addon_version_num >= COALESCE(lvr.min_addon_version_num, 0)
    ORDER BY COALESCE(li.duplicate_group_id, li.id), COALESCE(sr.ranked_duration_ms, sr.duration_ms) ASC
),
guild_best AS (
    SELECT instance_name, difficulty_name, guild_id, MIN(duration_ms) AS duration_ms
    FROM board
    GROUP BY instance_name, difficulty_name, guild_id
),
positional AS (
    SELECT
        b.instance_id,
        b.instance_name,
        b.realm_id,
        b.duration_ms,
        (
            SELECT COUNT(*)
            FROM guild_best gb
            WHERE gb.instance_name = b.instance_name
              AND gb.difficulty_name = b.difficulty_name
              AND gb.guild_id != b.guild_id
              AND gb.duration_ms < b.duration_ms
        ) + 1 AS speedrun_rank
    FROM board b
    JOIN parsed_log_group plg ON plg.id = b.log_group_id AND plg.finalized_at IS NOT NULL
    JOIN wow_log_groups wlg ON wlg.id = plg.id AND plg.parse_generation = wlg.parse_generation
    WHERE 'unit-position' = ANY(b.capabilities)
      AND b.invalidated_at IS NULL
),
numbered AS (
    SELECT
        p.*,
        ROW_NUMBER() OVER (PARTITION BY p.instance_name ORDER BY p.speedrun_rank, p.duration_ms, p.instance_id) AS instance_place
    FROM positional p
)
SELECT
    instance_id,
    instance_name,
    realm_id,
    duration_ms,
    speedrun_rank::bigint AS speedrun_rank
FROM numbered
WHERE instance_place <= @per_instance::int
ORDER BY instance_name, instance_place;
