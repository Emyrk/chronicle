-- name: InsertLogFile :one
INSERT INTO
  log_file(
    id,
    owner,
    hash,
    wow_log_id,
    size_bytes,
    mime_type,
    created_at,
    updated_at
  )
VALUES
  (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8
   )
RETURNING *
;

-- name: InsertWoWLogGroup :one
INSERT INTO
  wow_log_groups(
    id,
    owner,
    created_at,
    updated_at
  )
VALUES
  (
    $1,
    $2,
    $3,
    $4
  )
RETURNING *
;

-- name: GetWoWLogFilesByGroupID :many
SELECT
  *
FROM
  log_file
WHERE
  wow_log_id = $1
ORDER BY
  created_at DESC
;

-- name: DeleteWoWLogGroup :exec
DELETE FROM
  wow_log_groups
WHERE
  id = $1
;

-- name: DeleteWoWLogGroupFiles :many
UPDATE
  log_file
SET
  storage_deleted_at = $1
WHERE
  wow_log_id = $2
RETURNING *
;

-- name: ListAllWoWLogGroupsWithOwner :many
SELECT
  sqlc.embed(wow_log_groups),
  u.username AS owner_name,
  files_agg.files,
  latest_job.output AS processing_output
FROM
  wow_log_groups
    LEFT JOIN users u ON u.id = wow_log_groups.owner
    LEFT JOIN LATERAL (
    SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', lf.id,
        'owner', lf.owner,
        'wow_log_id', lf.wow_log_id,
        'hash', lf.hash,
        'size_bytes', lf.size_bytes,
        'mime_type', lf.mime_type,
        'created_at', lf.created_at,
        'updated_at', lf.updated_at
      )
      ORDER BY lf.created_at) FILTER (WHERE lf.id IS NOT NULL),
      '[]'::jsonb
    )::wow_log_group_files AS files
    FROM log_file lf
    WHERE lf.wow_log_id = wow_log_groups.id
    ) files_agg ON true

    LEFT JOIN LATERAL (
    SELECT rj.metadata->'output' AS output
    FROM river_job rj
    WHERE rj.args ->> 'log_group_id' = wow_log_groups.id::text
    ORDER BY rj.created_at DESC
    LIMIT 1
    ) latest_job ON true
ORDER BY
  wow_log_groups.created_at DESC
;

-- name: GetWoWLogGroupsByOwner :many
SELECT
  sqlc.embed(wow_log_groups),
  files_agg.files,
  latest_job.output AS processing_output
FROM
  wow_log_groups
    LEFT JOIN LATERAL (
    SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', lf.id,
        'owner', lf.owner,
        'wow_log_id', lf.wow_log_id,
        'hash', lf.hash,
        'size_bytes', lf.size_bytes,
        'mime_type', lf.mime_type,
        'created_at', lf.created_at,
        'updated_at', lf.updated_at,
        'storage_deleted_at', lf.storage_deleted_at
      )
      ORDER BY lf.created_at) FILTER (WHERE lf.id IS NOT NULL),
      '[]'::jsonb
    )::wow_log_group_files AS files
    FROM log_file lf
    WHERE lf.wow_log_id = wow_log_groups.id
    ) files_agg ON true

    LEFT JOIN LATERAL (
    SELECT rj.metadata->'output' AS output
    FROM river_job rj
    WHERE rj.args ->> 'log_group_id' = wow_log_groups.id::text
    ORDER BY rj.created_at DESC
    LIMIT 1
    ) latest_job ON true
WHERE
  wow_log_groups.owner = $1
ORDER BY
  wow_log_groups.created_at DESC
;

-- name: GetWoWLogGroupByID :one
SELECT
  sqlc.embed(wow_log_groups),
  COALESCE(
      jsonb_agg(
      jsonb_build_object(
        'id', json_file.id,
        'owner', json_file.owner,
        'wow_log_id', json_file.wow_log_id,
        'hash', json_file.hash,
        'size_bytes', json_file.size_bytes,
        'mime_type', json_file.mime_type,
        'created_at', json_file.created_at,
        'updated_at', json_file.updated_at,
        'storage_deleted_at', json_file.storage_deleted_at
      )
      ORDER BY json_file.created_at
               ) FILTER (WHERE json_file.id IS NOT NULL),
      '[]'::jsonb
  )::wow_log_group_files AS files
FROM
  wow_log_groups
LEFT JOIN log_file json_file
    ON json_file.wow_log_id = wow_log_groups.id
WHERE
  wow_log_groups.id = $1
GROUP BY
  wow_log_groups.id
;