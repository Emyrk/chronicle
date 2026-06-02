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
    format,
    flavor,
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
    $7
  )
RETURNING *
;

-- name: BackfillLogGroupFlavors :execrows
-- Sets the flavor for every log group that has none yet. The flavor value is
-- build-tag dependent (resolved in Go), so this can't be a SQL migration.
UPDATE wow_log_groups
SET flavor = @flavor::text[]
WHERE flavor IS NULL
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

-- name: UpdateWoWLogGroupFormatFlavor :exec
-- Sets the parse axes directly (admin reparse override). Either may be omitted
-- via a NULL narg to leave that column unchanged.
UPDATE
  wow_log_groups
SET
  format = COALESCE(sqlc.narg('format')::log_format, format),
  flavor = COALESCE(sqlc.narg('flavor')::text[], flavor),
  updated_at = NOW()
WHERE
  id = sqlc.arg('id')
;

-- name: UpdateWoWLogGroupLogType :exec
UPDATE
  wow_log_groups
SET
  log_type = $2,
  format = $3,
  updated_at = NOW()
WHERE
  id = $1
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
  instances_output.output AS processing_output
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

    LEFT JOIN parsed_log_group plg ON plg.id = wow_log_groups.id

    LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
        'complete', CASE WHEN plg.id IS NOT NULL THEN to_jsonb(wow_log_groups.updated_at) ELSE NULL END,
        'instances', COALESCE((
          SELECT jsonb_agg(inst_data ORDER BY instance_name)
            FROM (
            SELECT inst_data, instance_name
            FROM (
                SELECT jsonb_build_object(
                    'id', li.id,
                    'name', li.name,
                    'slug', li.hashed_slug,
                    'realm_id', li.realm_id,
                    'log_group_id', li.log_group_id,
                    'encounters', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                            'id', e.id,
                            'instance_id', e.instance_id,
                        'boss', e.boss,
                        'name', e.name,
                        'kill_type', e.kill_type,
                        'remaining', e.remaining,
                            'start_time', e.start_time,
                            'end_time', e.end_time
                        ) ORDER BY e.start_time)
                        FROM log_instance_encounters e
                        WHERE e.instance_id = li.id
                    ), '[]'::jsonb)
                ) AS inst_data,
                li.name AS instance_name
                FROM log_instances li
                WHERE li.log_group_id = wow_log_groups.id
            AND btrim(li.name) <> ''

          UNION ALL

          SELECT jsonb_build_object(
            'id', wow_log_groups.id,
            'name', sm.instance_name,
            'slug', NULL,
            'realm_id', sm.realm_id,
            'log_group_id', wow_log_groups.id,
            'encounters', '[]'::jsonb
                ) AS inst_data,
                sm.instance_name AS instance_name
          FROM server_upload_meta sm
          WHERE sm.log_group_id = wow_log_groups.id
            AND btrim(sm.instance_name) <> ''
            AND NOT EXISTS (
            SELECT 1
            FROM log_instances li
            WHERE li.log_group_id = wow_log_groups.id
              AND btrim(li.name) <> ''
            )
          ) ordered_instances
            ) sub
        ), '[]'::jsonb)
    ) AS output
    ) instances_output ON true
ORDER BY
  wow_log_groups.created_at DESC
;

-- name: ListAllWoWLogGroupsWithOwnerPaginated :many
SELECT
  sqlc.embed(wow_log_groups),
  u.username AS owner_name,
  files_agg.files,
  files_agg.total_size_bytes,
  instances_output.output AS processing_output,
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

    LEFT JOIN parsed_log_group plg ON plg.id = wow_log_groups.id

    -- Instances from DB tables
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
          'complete', CASE WHEN plg.id IS NOT NULL THEN to_jsonb(wow_log_groups.updated_at) ELSE NULL END,
          'instances', COALESCE((
              SELECT jsonb_agg(inst_data)
              FROM (
                  SELECT jsonb_build_object(
                      'id', li.id,
                      'name', li.name,
                      'slug', li.hashed_slug,
                      'realm_id', li.realm_id,
                      'log_group_id', li.log_group_id,
                      'encounters', COALESCE((
                          SELECT jsonb_agg(jsonb_build_object(
                              'id', e.id,
                              'instance_id', e.instance_id,
                            'boss', e.boss,
                            'name', e.name,
                            'kill_type', e.kill_type,
                            'remaining', e.remaining,
                              'start_time', e.start_time,
                              'end_time', e.end_time
                          ) ORDER BY e.start_time)
                          FROM log_instance_encounters e
                          WHERE e.instance_id = li.id
                      ), '[]'::jsonb)
                  ) AS inst_data
                  FROM log_instances li
                  WHERE li.log_group_id = wow_log_groups.id
                  ORDER BY li.name
              ) sub
          ), '[]'::jsonb)
      ) AS output
    ) instances_output ON true
    -- Instance names aggregate
    LEFT JOIN LATERAL (
      SELECT 
        COALESCE(array_agg(inst_names.name ORDER BY inst_names.name), ARRAY[]::text[]) AS instance_names,
        MIN(inst_names.name) AS first_instance_name
      FROM (
        SELECT DISTINCT li.name
        FROM log_instances li
        WHERE li.log_group_id = wow_log_groups.id
          AND btrim(li.name) <> ''

        UNION

        SELECT sm.instance_name AS name
        FROM server_upload_meta sm
        WHERE sm.log_group_id = wow_log_groups.id
          AND btrim(sm.instance_name) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM log_instances li
            WHERE li.log_group_id = wow_log_groups.id
              AND btrim(li.name) <> ''
          )
      ) inst_names
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
  SELECT COALESCE(array_agg(inst_names.name ORDER BY inst_names.name), ARRAY[]::text[]) AS instance_names
  FROM (
    SELECT DISTINCT li.name
    FROM log_instances li
    WHERE li.log_group_id = wow_log_groups.id
      AND btrim(li.name) <> ''

    UNION

    SELECT sm.instance_name AS name
    FROM server_upload_meta sm
    WHERE sm.log_group_id = wow_log_groups.id
      AND btrim(sm.instance_name) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM log_instances li
        WHERE li.log_group_id = wow_log_groups.id
          AND btrim(li.name) <> ''
      )
  ) inst_names
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
SELECT DISTINCT name
FROM (
  SELECT li.name
  FROM log_instances li
  WHERE btrim(li.name) <> ''

  UNION

  SELECT sm.instance_name AS name
  FROM server_upload_meta sm
  WHERE btrim(sm.instance_name) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM log_instances li
      WHERE li.log_group_id = sm.log_group_id
        AND btrim(li.name) <> ''
    )
) names
ORDER BY name ASC;


-- name: GetWoWLogGroupsByOwner :many
SELECT
  sqlc.embed(wow_log_groups),
  files_agg.files,
  instances_output.output AS processing_output
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

    LEFT JOIN parsed_log_group plg ON plg.id = wow_log_groups.id

    LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
        'complete', CASE WHEN plg.id IS NOT NULL THEN to_jsonb(wow_log_groups.updated_at) ELSE NULL END,
        'instances', COALESCE((
            SELECT jsonb_agg(inst_data)
            FROM (
                SELECT jsonb_build_object(
                    'id', li.id,
                    'name', li.name,
                    'slug', li.hashed_slug,
                    'realm_id', li.realm_id,
                    'realm_name', wsr.name,
                    'server_name', ws.name,
                    'tenant_name', t.name,
                    'log_group_id', li.log_group_id,
                    'encounters', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                            'id', e.id,
                            'instance_id', e.instance_id,
                        'boss', e.boss,
                        'name', e.name,
                        'kill_type', e.kill_type,
                        'remaining', e.remaining,
                            'start_time', e.start_time,
                            'end_time', e.end_time
                        ) ORDER BY e.start_time)
                        FROM log_instance_encounters e
                        WHERE e.instance_id = li.id
                    ), '[]'::jsonb)
                ) AS inst_data
                FROM log_instances li
                LEFT JOIN wow_server_realms wsr ON li.realm_id = wsr.id
                LEFT JOIN wow_servers ws ON wsr.server_id = ws.id
                LEFT JOIN tenants t ON ws.tenant_id = t.id
                WHERE li.log_group_id = wow_log_groups.id
                ORDER BY li.name
            ) sub
        ), '[]'::jsonb)
    ) AS output
    ) instances_output ON true
WHERE
  wow_log_groups.owner = $1
  AND (
    sqlc.narg('created_after')::timestamptz IS NULL
    OR sqlc.narg('created_before')::timestamptz IS NULL
    OR (wow_log_groups.created_at >= sqlc.narg('created_after') AND wow_log_groups.created_at < sqlc.narg('created_before'))
    OR EXISTS (
      SELECT 1
      FROM log_instances li
      WHERE li.log_group_id = wow_log_groups.id
        AND li.start_time < sqlc.narg('created_before')
        AND li.end_time >= sqlc.narg('created_after')
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

-- name: UpdateLogFileAfterAppend :exec
UPDATE log_file
SET hash = @hash,
    size_bytes = @size_bytes,
    compressed_size_bytes = @compressed_size_bytes,
    content_encoding = @content_encoding,
    updated_at = now()
WHERE id = @id;



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

-- name: GetExpiredRawLogGroups :many
-- Returns log groups whose raw files are past their owner's retention window.
-- Only considers users who have set a retention policy (non-NULL).
SELECT DISTINCT
  wlg.id AS log_group_id
FROM wow_log_groups wlg
JOIN log_file lf ON lf.wow_log_id = wlg.id
JOIN users u ON u.id = lf.owner
WHERE
  u.raw_log_retention_hours IS NOT NULL
  AND lf.storage_deleted_at IS NULL
  AND lf.created_at < NOW() - make_interval(hours => u.raw_log_retention_hours)
LIMIT $1
;