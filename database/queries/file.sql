-- name: InsertLogFile :one
INSERT INTO
  log_file(
    id,
    owner,
    hash,
    wow_log_id,
    size_bytes,
    mime_type,
    compressed_size_bytes,
    content_encoding,
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
    $8,
    $9,
    $10
   )
RETURNING *
;

-- name: InsertWoWLogGroup :one
INSERT INTO
  wow_log_groups(
    id,
    owner,
    log_type,
    created_at,
    updated_at
  )
VALUES
  (
    $1,
    $2,
    $3,
    $4,
    $5
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
        'compressed_size_bytes', lf.compressed_size_bytes,
        'content_encoding', lf.content_encoding,
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

-- name: ListAllWoWLogGroupsWithOwnerPaginated :many
SELECT
  sqlc.embed(wow_log_groups),
  u.username AS owner_name,
  files_agg.files,
  files_agg.total_size_bytes,
  latest_job.output AS processing_output,
  instances_agg.instance_names,
  instances_agg.first_instance_name
FROM
  wow_log_groups
    LEFT JOIN users u ON u.id = wow_log_groups.owner
    -- Files aggregate with total size
    LEFT JOIN LATERAL (
      SELECT 
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', lf.id,
              'owner', lf.owner,
              'wow_log_id', lf.wow_log_id,
              'hash', lf.hash,
              'size_bytes', lf.size_bytes,
              'mime_type', lf.mime_type,
              'compressed_size_bytes', lf.compressed_size_bytes,
              'content_encoding', lf.content_encoding,
              'created_at', lf.created_at,
              'updated_at', lf.updated_at
            )
            ORDER BY lf.created_at
          ) FILTER (WHERE lf.id IS NOT NULL),
          '[]'::jsonb
        )::wow_log_group_files AS files,
        COALESCE(SUM(lf.size_bytes), 0) AS total_size_bytes
      FROM log_file lf
      WHERE lf.wow_log_id = wow_log_groups.id
    ) files_agg ON true
    -- Latest job output
    LEFT JOIN LATERAL (
      SELECT rj.metadata->'output' AS output
      FROM river_job rj
      WHERE rj.args ->> 'log_group_id' = wow_log_groups.id::text
      ORDER BY rj.created_at DESC
      LIMIT 1
    ) latest_job ON true
    -- Instance names aggregate
    LEFT JOIN LATERAL (
      SELECT 
        COALESCE(array_agg(li.name ORDER BY li.name), ARRAY[]::text[]) AS instance_names,
        MIN(li.name) AS first_instance_name
      FROM log_instances li
      WHERE li.log_group_id = wow_log_groups.id
    ) instances_agg ON true
WHERE
  -- Filter by user ID (skip if nil UUID)
  CASE WHEN @filter_user_id::uuid != '00000000-0000-0000-0000-000000000000'::uuid 
       THEN wow_log_groups.owner = @filter_user_id 
       ELSE true END
  AND
  -- Filter by instance name (skip if empty string)
  CASE WHEN @filter_instance_name::text != '' 
       THEN @filter_instance_name = ANY(instances_agg.instance_names)
       ELSE true END
ORDER BY
  CASE WHEN @sort_by::text = 'date' AND @sort_order::text = 'desc' THEN wow_log_groups.created_at END DESC,
  CASE WHEN @sort_by::text = 'date' AND @sort_order::text = 'asc' THEN wow_log_groups.created_at END ASC,
  CASE WHEN @sort_by::text = 'user' AND @sort_order::text = 'desc' THEN u.username END DESC NULLS LAST,
  CASE WHEN @sort_by::text = 'user' AND @sort_order::text = 'asc' THEN u.username END ASC NULLS LAST,
  CASE WHEN @sort_by::text = 'size' AND @sort_order::text = 'desc' THEN files_agg.total_size_bytes END DESC,
  CASE WHEN @sort_by::text = 'size' AND @sort_order::text = 'asc' THEN files_agg.total_size_bytes END ASC,
  CASE WHEN @sort_by::text = 'instance' AND @sort_order::text = 'desc' THEN instances_agg.first_instance_name END DESC NULLS LAST,
  CASE WHEN @sort_by::text = 'instance' AND @sort_order::text = 'asc' THEN instances_agg.first_instance_name END ASC NULLS LAST,
  wow_log_groups.id
LIMIT @limit_count
OFFSET @offset_count;

-- name: CountAllWoWLogGroups :one
SELECT COUNT(*)::int FROM wow_log_groups
LEFT JOIN LATERAL (
  SELECT array_agg(li.name) AS instance_names
  FROM log_instances li
  WHERE li.log_group_id = wow_log_groups.id
) instances_agg ON true
WHERE 
  CASE WHEN @filter_user_id::uuid != '00000000-0000-0000-0000-000000000000'::uuid 
       THEN wow_log_groups.owner = @filter_user_id 
       ELSE true END
  AND
  CASE WHEN @filter_instance_name::text != '' 
       THEN @filter_instance_name = ANY(instances_agg.instance_names)
       ELSE true END;

-- name: ListDistinctInstanceNames :many
SELECT DISTINCT li.name
FROM log_instances li
ORDER BY li.name ASC;


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
        'compressed_size_bytes', lf.compressed_size_bytes,
        'content_encoding', lf.content_encoding,
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
  AND (
    sqlc.narg('created_after')::timestamptz IS NULL
    OR sqlc.narg('created_before')::timestamptz IS NULL
    OR wow_log_groups.created_at >= sqlc.narg('created_after') AND wow_log_groups.created_at < sqlc.narg('created_before')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(latest_job.output->'instances') inst,
           jsonb_array_elements(inst->'encounters') enc
      WHERE (enc->>'start_time')::timestamptz >= sqlc.narg('created_after')
        AND (enc->>'start_time')::timestamptz < sqlc.narg('created_before')
    )
  )
ORDER BY
  wow_log_groups.created_at DESC
;

-- name: GetFileByHash :one
SELECT * FROM log_file WHERE hash = $1;
;

-- name: GetLogFile :one
SELECT * FROM log_file WHERE id = $1;


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
        'compressed_size_bytes', json_file.compressed_size_bytes,
        'content_encoding', json_file.content_encoding,
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