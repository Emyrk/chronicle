-- name: DeleteAllParsedLogsByGroupID :exec
DELETE FROM
  parsed_log_group
WHERE
  id = $1
;

-- name: DeleteLogInstanceByIDAndGroup :one
DELETE FROM
  log_instances
WHERE
  id = $1
  AND log_group_id = $2
RETURNING
  id
;

-- name: PruneParsedInstanceFromLogOutput :exec
UPDATE
  river_job
SET
  metadata = jsonb_set(
    metadata,
    '{output,instances}',
    COALESCE(
      (
        SELECT
          jsonb_agg(elem)
        FROM
          jsonb_array_elements(COALESCE(metadata -> 'output' -> 'instances', '[]'::jsonb)) AS elem
        WHERE
          elem ->> 'id' <> sqlc.arg(instance_id)::text
      ),
      '[]'::jsonb
    ),
    true
  )
WHERE
  args ->> 'log_group_id' = sqlc.arg(log_group_id)::text
  AND kind = 'log-parse'
;

-- name: InsertParsedLogGroup :exec
INSERT INTO
  parsed_log_group (id)
VALUES
  ($1)
;

-- name: InsertInstance :one
INSERT INTO
  log_instances (id, realm_id, log_group_id, name, hashed_slug, guild_id, start_time, end_time, capabilities, versions, recorder_name, recorder_guid, parser_version, difficulty_name, max_players, dynamic_difficulty, vehicle_control_intervals)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
RETURNING *
;

-- name: InsertEncounter :one
INSERT INTO
  log_instance_encounters (id, instance_id, name, kill_type, remaining, boss, start_time, end_time)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *
;

-- name: GetInstancesByLogGroupID :many
SELECT
  *
FROM
  log_instances_guild
WHERE
  log_group_id = $1;

-- name: Instance :one
SELECT
  *
FROM
  log_instances_guild
WHERE
  log_instances_guild.id = $1
;

-- name: InstanceBySlug :one
SELECT
  *
FROM
  log_instances_guild
WHERE
  hashed_slug = $1 AND hashed_slug != ''
;

-- name: EncountersByInstanceID :many
SELECT
  *
FROM
  log_instance_encounters
WHERE
  instance_id = $1
;

-- name: InsertInstanceUnits :batchexec
INSERT INTO
  log_instance_units (instance_id, unit_guid, name, entry, owner_guid)
VALUES
  ($1, $2, $3, $4, $5)
;

-- name: InsertInstancePlayers :batchexec
INSERT INTO
  log_instance_players (instance_id, unit_guid, name, level, class, race, guild_id)
VALUES
  ($1, $2, $3, $4, $5, $6, $7)
;

-- name: InsertEncounterCharacterFights :batchexec
INSERT INTO
  log_instance_encounter_hostiles (id, boss, encounter_id, periods)
VALUES
  ($1, $2, $3, $4)
;

-- name: GetInstanceEncounterCharacterFights :many
SELECT
  *
FROM
  log_instance_encounter_hostiles
WHERE
  encounter_id IN (SELECT id FROM log_instance_encounters WHERE instance_id = $1)
;

-- name: InstanceUnitsByInstanceID :many
SELECT
  *
FROM
  log_instance_units
WHERE
  instance_id = $1
;

-- name: InstancePlayersByInstanceID :many
SELECT
  *
FROM
  log_instance_players
WHERE
  instance_id = $1
;

-- name: ListRecentInstances :many
SELECT 
    li.id,
    li.hashed_slug as slug,
  COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) as name,
    li.realm_id,
    wsr.name as realm_name,
    wlg.owner as uploader_id,
    u.username as uploader_name,
    wlg.created_at as uploaded_at,
    COALESCE(
        (SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id),
        wlg.created_at
    ) as first_encounter_time,
    (SELECT COUNT(*) FROM log_instance_players lip WHERE lip.instance_id = li.id) as player_count,
    (SELECT COUNT(*) FROM log_instance_encounters lie WHERE lie.instance_id = li.id AND lie.boss = true) as boss_count,
    (SELECT COUNT(*) FROM log_instance_encounters lie WHERE lie.instance_id = li.id AND lie.boss = true AND lie.kill_type IN ('clean', 'partial')) as boss_kills,
    COALESCE((SELECT EXTRACT(EPOCH FROM (MAX(lie.end_time) - MIN(lie.start_time))) * 1000 
     FROM log_instance_encounters lie WHERE lie.instance_id = li.id), 0)::float8 as duration_ms,
    iom.total_combat_duration_ms as combat_duration_ms,
    g.id as guild_id,
    g.name as guild_name,
    EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug) as has_youtube_video,
    li.duplicate_group_id,
    li.recorder_name,
    li.difficulty_name,
    li.max_players,
    li.dynamic_difficulty
FROM log_instances li
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
LEFT JOIN instance_overview_metrics iom ON iom.instance_id = li.id
LEFT JOIN server_upload_meta sm ON sm.log_group_id = li.log_group_id
JOIN users u ON u.id = wlg.owner
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN guilds g ON g.id = li.guild_id
WHERE true
    -- Filter by instance names
    AND CASE
        WHEN cardinality(@instance_names :: text[]) > 0 THEN
      COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) = ANY(@instance_names :: text[])
        ELSE true
    END
    -- Filter by video presence
    AND CASE
        WHEN @has_video :: text = 'true' THEN
            EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug)
        WHEN @has_video :: text = 'false' THEN
            NOT EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug)
        ELSE true
    END
    -- Filter by realm
    AND CASE
        WHEN @realm_id :: uuid != '00000000-0000-0000-0000-000000000000'::uuid THEN
            li.realm_id = @realm_id
        ELSE true
    END
    -- Filter by guild
    AND CASE
        WHEN @guild_id :: uuid != '00000000-0000-0000-0000-000000000000'::uuid THEN
            li.guild_id = @guild_id
        ELSE true
    END
    -- Cursor pagination (first_encounter_time, id) - pass '0001-01-01' to skip
    AND CASE
        WHEN @cursor_time :: timestamptz != '0001-01-01'::timestamptz THEN
            (COALESCE((SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id), wlg.created_at) < @cursor_time 
             OR (COALESCE((SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id), wlg.created_at) = @cursor_time AND li.id < @cursor_id :: uuid))
        ELSE true
    END
ORDER BY first_encounter_time DESC, li.id DESC
LIMIT @limit_count;

-- name: ListInstancesByTimeRange :many
SELECT 
    li.id,
    li.hashed_slug as slug,
  COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) as name,
    li.realm_id,
    wsr.name as realm_name,
    wlg.owner as uploader_id,
    u.username as uploader_name,
    wlg.created_at as uploaded_at,
    COALESCE(
        (SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id),
        wlg.created_at
    ) as first_encounter_time,
    (SELECT COUNT(*) FROM log_instance_players lip WHERE lip.instance_id = li.id) as player_count,
    (SELECT COUNT(*) FROM log_instance_encounters lie WHERE lie.instance_id = li.id AND lie.boss = true) as boss_count,
    (SELECT COUNT(*) FROM log_instance_encounters lie WHERE lie.instance_id = li.id AND lie.boss = true AND lie.kill_type IN ('clean', 'partial')) as boss_kills,
    COALESCE((SELECT EXTRACT(EPOCH FROM (MAX(lie.end_time) - MIN(lie.start_time))) * 1000 
     FROM log_instance_encounters lie WHERE lie.instance_id = li.id), 0)::float8 as duration_ms,
    iom.total_combat_duration_ms as combat_duration_ms,
    g.id as guild_id,
    g.name as guild_name,
    EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug) as has_youtube_video,
    li.duplicate_group_id,
    li.recorder_name,
    li.difficulty_name,
    li.max_players,
    li.dynamic_difficulty
FROM log_instances li
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
LEFT JOIN instance_overview_metrics iom ON iom.instance_id = li.id
LEFT JOIN server_upload_meta sm ON sm.log_group_id = li.log_group_id
JOIN users u ON u.id = wlg.owner
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN guilds g ON g.id = li.guild_id
WHERE true
    -- Time range filter (required)
    AND COALESCE(
        (SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id),
        wlg.created_at
    ) >= @start_time :: timestamptz
    AND COALESCE(
        (SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id),
        wlg.created_at
    ) < @end_time :: timestamptz
    -- Filter by instance names
    AND CASE
        WHEN cardinality(@instance_names :: text[]) > 0 THEN
        COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) = ANY(@instance_names :: text[])
        ELSE true
    END
    -- Filter by video presence
    AND CASE
        WHEN @has_video :: text = 'true' THEN
            EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug)
        WHEN @has_video :: text = 'false' THEN
            NOT EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug)
        ELSE true
    END
    -- Filter by realm
    AND CASE
        WHEN @realm_id :: uuid != '00000000-0000-0000-0000-000000000000'::uuid THEN
            li.realm_id = @realm_id
        ELSE true
    END
    -- Filter by guild
    AND CASE
        WHEN @guild_id :: uuid != '00000000-0000-0000-0000-000000000000'::uuid THEN
            li.guild_id = @guild_id
        ELSE true
    END
    -- Filter by player GUID
    AND CASE
        WHEN @player_guid :: wow_guid != '0x0000000000000000' :: wow_guid THEN
            EXISTS (SELECT 1 FROM log_instance_players lip_filter WHERE lip_filter.instance_id = li.id AND lip_filter.unit_guid = @player_guid)
        ELSE true
    END
ORDER BY first_encounter_time DESC, li.id DESC
LIMIT CASE WHEN @limit_count :: int > 0 THEN @limit_count ELSE NULL END
OFFSET @offset_count;

-- name: ListRecentInstancesByPlayer :many
SELECT DISTINCT ON (
        COALESCE((SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id), wlg.created_at),
        li.id
    )
    li.id,
    li.hashed_slug as slug,
    COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) as name,
    li.realm_id,
    wsr.name as realm_name,
    wlg.owner as uploader_id,
    u.username as uploader_name,
    wlg.created_at as uploaded_at,
    COALESCE(
        (SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id),
        wlg.created_at
    ) as first_encounter_time,
    (SELECT COUNT(*) FROM log_instance_players lip2 WHERE lip2.instance_id = li.id) as player_count,
    (SELECT COUNT(*) FROM log_instance_encounters lie WHERE lie.instance_id = li.id AND lie.boss = true) as boss_count,
    (SELECT COUNT(*) FROM log_instance_encounters lie WHERE lie.instance_id = li.id AND lie.boss = true AND lie.kill_type IN ('clean', 'partial')) as boss_kills,
    COALESCE((SELECT EXTRACT(EPOCH FROM (MAX(lie.end_time) - MIN(lie.start_time))) * 1000 
     FROM log_instance_encounters lie WHERE lie.instance_id = li.id), 0)::float8 as duration_ms,
    g.id as guild_id,
    g.name as guild_name,
    EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug) as has_youtube_video,
    li.duplicate_group_id,
    li.recorder_name,
    li.difficulty_name,
    li.max_players,
    li.dynamic_difficulty
FROM log_instances li
JOIN log_instance_players lip ON lip.instance_id = li.id
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
LEFT JOIN server_upload_meta sm ON sm.log_group_id = li.log_group_id
JOIN users u ON u.id = wlg.owner
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN guilds g ON g.id = li.guild_id
WHERE lip.name ILIKE @player_name
    -- Filter by instance names
    AND CASE
        WHEN cardinality(@instance_names :: text[]) > 0 THEN
      COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) = ANY(@instance_names :: text[])
        ELSE true
    END
    -- Filter by video presence
    AND CASE
        WHEN @has_video :: text = 'true' THEN
            EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug)
        WHEN @has_video :: text = 'false' THEN
            NOT EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug)
        ELSE true
    END
    -- Filter by realm
    AND CASE
        WHEN @realm_id :: uuid != '00000000-0000-0000-0000-000000000000'::uuid THEN
            li.realm_id = @realm_id
        ELSE true
    END
    -- Filter by guild
    AND CASE
        WHEN @guild_id :: uuid != '00000000-0000-0000-0000-000000000000'::uuid THEN
            li.guild_id = @guild_id
        ELSE true
    END
    -- Cursor pagination
    AND CASE
        WHEN @cursor_time :: timestamptz != '0001-01-01'::timestamptz THEN
            (COALESCE((SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id), wlg.created_at) < @cursor_time 
             OR (COALESCE((SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id), wlg.created_at) = @cursor_time AND li.id < @cursor_id :: uuid))
        ELSE true
    END
ORDER BY COALESCE((SELECT MIN(lie.start_time) FROM log_instance_encounters lie WHERE lie.instance_id = li.id), wlg.created_at) DESC, li.id DESC
LIMIT @limit_count;

-- name: GetEncounterSummariesByInstanceID :many
SELECT
    lie.id,
    lie.name,
    lie.boss,
    lie.kill_type
FROM log_instance_encounters lie
WHERE lie.instance_id = $1
ORDER BY lie.start_time ASC;

-- name: GetEncounterSummariesByInstanceIDs :many
SELECT
    lie.instance_id,
    lie.id,
    lie.name,
    lie.boss,
    lie.kill_type
FROM log_instance_encounters lie
WHERE lie.instance_id = ANY(@instance_ids :: uuid[])
ORDER BY lie.instance_id, lie.start_time ASC;

-- name: FindDuplicateInstanceCandidates :many
SELECT li.id, li.duplicate_group_id
FROM log_instances li
WHERE li.realm_id = @realm_id
  AND li.name = @name
  AND li.max_players = @max_players
  AND li.dynamic_difficulty = @dynamic_difficulty
  AND li.start_time >= @window_start
  AND li.start_time <= @window_end
  AND li.id != @exclude_id
ORDER BY li.start_time ASC
LIMIT 40;

-- name: SetDuplicateGroupIDs :exec
UPDATE log_instances
SET duplicate_group_id = @duplicate_group_id
WHERE id = ANY(@ids::uuid[])
   OR (duplicate_group_id IS NOT NULL AND duplicate_group_id = ANY(@ids::uuid[]));

-- name: InstancePlayerGUIDsByInstanceID :many
SELECT unit_guid FROM log_instance_players WHERE instance_id = $1;

-- name: ClearDuplicateGroupID :exec
UPDATE log_instances SET duplicate_group_id = NULL WHERE id = @id;
-- name: ListInstancesByDuplicateGroup :many
SELECT
    li.id,
    li.hashed_slug as slug,
    li.name,
    li.recorder_name,
    wlg.owner as uploader_id,
    u.username as uploader_name,
    (SELECT COUNT(*) FROM log_instance_players lip WHERE lip.instance_id = li.id) as player_count,
    COALESCE((SELECT EXTRACT(EPOCH FROM (MAX(lie.end_time) - MIN(lie.start_time))) * 1000
     FROM log_instance_encounters lie WHERE lie.instance_id = li.id), 0)::float8 as duration_ms
FROM log_instances li
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
JOIN users u ON u.id = wlg.owner
WHERE li.duplicate_group_id = @duplicate_group_id
ORDER BY li.id;





