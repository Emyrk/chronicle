-- name: InsertInstanceSpeedrun :exec
INSERT INTO instance_speedruns (
    instance_id, instance_name, realm_id, guild_id,
    qualified, start_time, completion_time, duration_ms, proof,
    addon_version, parser_version_num, addon_version_num
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: GetInstanceSpeedrun :one
SELECT sr.*, li.capabilities
FROM instance_speedruns sr
JOIN log_instances li ON li.id = sr.instance_id
WHERE sr.instance_id = $1;

-- name: GetInstanceEncounterKillTimes :many
SELECT
    lie.name AS encounter_name,
    (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint AS duration_ms
FROM log_instance_encounters lie
WHERE lie.instance_id = $1
  AND lie.boss = true
  AND lie.kill_type = 'clean'
  AND lie.end_time > lie.start_time
ORDER BY lie.start_time;

-- name: InstanceSpeedrunCohort :many
-- Returns rankings-backed runs comparable to an anchor instance. Cohorts match
-- instance name, difficulty, and declared maximum raid size, use a historical
-- window ending at the anchor start time, and stay within the anchor's server
-- or guild. Duplicate uploads are collapsed without reducing to one run per guild.
WITH anchor AS (
    SELECT
        li.id,
        li.name,
        li.difficulty_name,
        li.max_players,
        li.start_time,
        li.guild_id,
        wsr.server_id
    FROM log_instances li
    JOIN wow_server_realms wsr ON wsr.id = li.realm_id
    WHERE li.id = @instance_id
),
deduped AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        sr.instance_id,
        li.hashed_slug,
        sr.start_time,
        sr.completion_time,
        sr.duration_ms,
        sr.qualified,
        sr.proof,
        sr.guild_id,
        COALESCE(g.name, '')::text AS guild_name,
        iom.requirements_complete,
        iom.player_deaths,
        iom.wipe_count,
        iom.top_incoming_damage_abilities,
        iom.encounter_span_duration_ms,
        iom.total_combat_duration_ms,
        iom.total_boss_duration_ms,
        iom.metrics_version,
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'encounter_name', lie.name,
                'duration_ms', (EXTRACT(EPOCH FROM (lie.end_time - lie.start_time)) * 1000)::bigint
            ) ORDER BY lie.start_time)
            FROM log_instance_encounters lie
            WHERE lie.instance_id = sr.instance_id
              AND lie.boss = true
              AND lie.kill_type = 'clean'
              AND lie.end_time > lie.start_time
        ), '[]'::jsonb)::text AS encounter_kill_times_json
    FROM anchor a
    JOIN instance_speedruns sr ON sr.instance_name = a.name
    JOIN log_instances li ON li.id = sr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
    LEFT JOIN guilds g ON g.id = sr.guild_id
    LEFT JOIN instance_overview_metrics iom
      ON iom.instance_id = sr.instance_id
     AND iom.metrics_version = @metrics_version
    LEFT JOIN leaderboard_version_requirements lvr ON lvr.instance_name = sr.instance_name
    WHERE li.difficulty_name = a.difficulty_name
      AND li.max_players = a.max_players
      AND sr.start_time >= a.start_time - make_interval(days => @lookback_days::int)
      AND sr.start_time <= a.start_time
      AND sr.parser_version_num >= COALESCE(lvr.min_parser_version_num, 0)
      AND sr.addon_version_num >= COALESCE(lvr.min_addon_version_num, 0)
      AND CASE
          WHEN @scope :: text = 'guild' THEN a.guild_id IS NOT NULL AND sr.guild_id = a.guild_id
          ELSE wsr.server_id = a.server_id
      END
    ORDER BY
        COALESCE(li.duplicate_group_id, li.id),
        sr.qualified DESC,
        (sr.duration_ms > 0) DESC,
        sr.duration_ms ASC,
        sr.start_time DESC
)
SELECT *
FROM deduped
ORDER BY start_time DESC;

-- name: SpeedrunLeaderboard :many
-- Returns the leaderboard for a given instance name.
-- Deduplicates by duplicate_group, then by guild (best per guild unless guild_id filter is set).
-- Excludes runs without a guild. Optional filters: realm, player count, guild.
-- Each difficulty has its own board: set filter_difficulty to select the board
-- matching difficulty_name (empty string matches runs with no recorded difficulty).
WITH deduped AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        sr.instance_id,
        sr.instance_name,
        li.difficulty_name,
        sr.guild_id,
        sr.duration_ms,
        sr.start_time,
        sr.completion_time,
        sr.qualified,
        sr.addon_version,
        li.hashed_slug,
        li.duplicate_group_id,
        li.parser_version,
        g.name AS guild_name,
        COALESCE(wsr.name, '') AS realm_name,
        (SELECT COUNT(*) FROM log_instance_players lip WHERE lip.instance_id = sr.instance_id) AS player_count,
        COALESCE(gp.theme->>'logo_url', '')::text AS guild_logo_url
    FROM instance_speedruns sr
    JOIN log_instances li ON li.id = sr.instance_id
    JOIN guilds g ON sr.guild_id = g.id
    LEFT JOIN guild_pages gp ON gp.guild_id = sr.guild_id
    JOIN wow_server_realms wsr ON sr.realm_id = wsr.id
    LEFT JOIN leaderboard_version_requirements lvr ON lvr.instance_name = sr.instance_name
    WHERE sr.instance_name = @instance_name
      AND sr.qualified = true
      AND sr.guild_id IS NOT NULL
      AND sr.parser_version_num >= COALESCE(lvr.min_parser_version_num, 0)
      AND sr.addon_version_num >= COALESCE(lvr.min_addon_version_num, 0)
      AND CASE
          WHEN cardinality(@realm_names :: text[]) > 0 THEN
              COALESCE(wsr.name, '') = ANY(@realm_names :: text[])
          ELSE true
      END
      AND CASE
          WHEN @guild_id :: text != '' THEN sr.guild_id = @guild_id :: uuid
          ELSE true
      END
      AND CASE
          WHEN @since_days :: bigint > 0 THEN sr.completion_time >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
      AND CASE
          WHEN @filter_difficulty :: boolean THEN li.difficulty_name = @difficulty_name :: text
          ELSE true
      END
    ORDER BY COALESCE(li.duplicate_group_id, li.id), sr.duration_ms ASC
),
-- When no guild filter: keep only the best run per guild.
-- When guild filter is set: keep all runs for that guild.
best AS (
    SELECT DISTINCT ON (
        CASE WHEN @guild_id :: text = '' THEN guild_id END
    ) *
    FROM deduped
    ORDER BY
        CASE WHEN @guild_id :: text = '' THEN guild_id END,
        duration_ms ASC
)
SELECT * FROM best
WHERE (CASE WHEN @min_players::bigint > 0 THEN player_count >= @min_players ELSE true END)
  AND (CASE WHEN @max_players::bigint > 0 THEN player_count <= @max_players ELSE true END)
ORDER BY duration_ms ASC
LIMIT 50;

-- name: SpeedrunInstanceBoards :many
-- Returns distinct (instance, difficulty) boards that have at least one
-- qualified speedrun. Each difficulty has its own leaderboard.
-- JOINs wow_server_realms so RLS tenant filtering cascades.
SELECT DISTINCT sr.instance_name, li.difficulty_name
FROM instance_speedruns sr
JOIN log_instances li ON li.id = sr.instance_id
JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
WHERE sr.qualified = true
ORDER BY sr.instance_name, li.difficulty_name;

-- name: SpeedrunDifficulties :many
-- Returns distinct difficulty names that have at least one qualified speedrun
-- for the given instance. Each difficulty has its own leaderboard.
-- JOINs wow_server_realms so RLS tenant filtering cascades.
SELECT DISTINCT li.difficulty_name
FROM instance_speedruns sr
JOIN log_instances li ON li.id = sr.instance_id
JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
WHERE sr.instance_name = @instance_name
  AND sr.qualified = true
ORDER BY li.difficulty_name;

-- name: SpeedrunRealmNames :many
-- Returns distinct realm names that have at least one qualified speedrun.
SELECT DISTINCT COALESCE(wsr.name, '') AS realm_name
FROM instance_speedruns sr
JOIN wow_server_realms wsr ON sr.realm_id = wsr.id
WHERE sr.qualified = true
ORDER BY realm_name;

-- name: GuildRaidClears :many
-- Returns per-instance clear counts and duration aggregates for a guild,
-- used by the guild page "Raid Clears" panel.
-- Deduplicates by duplicate_group so re-uploaded logs of the same raid count
-- once (best duration per group). Includes unqualified runs: a clear is a
-- clear, qualification only affects the public leaderboard. Requires
-- duration_ms > 0 because incomplete runs are inserted with a zero
-- completion_time and a negative sentinel duration (see chronicle/logparse.go).
-- JOINs wow_server_realms so RLS tenant filtering cascades.
WITH deduped AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        sr.instance_name,
        sr.duration_ms,
        sr.completion_time
    FROM instance_speedruns sr
    JOIN log_instances li ON li.id = sr.instance_id
    JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
    WHERE sr.guild_id = @guild_id :: uuid
      AND sr.duration_ms > 0
      AND CASE
          WHEN @since_days :: bigint > 0 THEN sr.completion_time >= now() - make_interval(days => @since_days::int)
          ELSE true
      END
    ORDER BY COALESCE(li.duplicate_group_id, li.id), sr.duration_ms ASC
)
SELECT
    instance_name,
    COUNT(*) :: bigint AS clear_count,
    MIN(duration_ms) :: bigint AS best_duration_ms,
    AVG(duration_ms) :: bigint AS avg_duration_ms,
    MAX(completion_time) :: timestamptz AS last_cleared_at
FROM deduped
GROUP BY instance_name
ORDER BY clear_count DESC, instance_name;

-- name: SpeedrunGuildClears :many
-- Returns guilds ranked by number of qualified full clears of the given
-- instance. Deduplicates runs by duplicate group so re-uploads of the same
-- raid only count once. JOINs wow_server_realms so RLS tenant filtering
-- cascades.
SELECT
    sr.guild_id::uuid AS guild_id,
    g.name AS guild_name,
    COALESCE(gp.theme->>'logo_url', '')::text AS guild_logo_url,
    COUNT(DISTINCT COALESCE(li.duplicate_group_id, li.id))::bigint AS clears
FROM instance_speedruns sr
JOIN log_instances li ON li.id = sr.instance_id
JOIN guilds g ON g.id = sr.guild_id
LEFT JOIN guild_pages gp ON gp.guild_id = sr.guild_id
JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
WHERE sr.instance_name = @instance_name
  AND sr.qualified = true
  AND sr.guild_id IS NOT NULL
  AND CASE
      WHEN @filter_difficulty :: boolean THEN li.difficulty_name = @difficulty_name :: text
      ELSE true
  END
GROUP BY sr.guild_id, g.name, gp.theme
ORDER BY clears DESC, g.name ASC
LIMIT NULLIF(@result_limit :: bigint, 0);
