-- name: InsertLogGroupArtifact :one
INSERT INTO log_group_artifacts (
  id,
  log_group_id,
  log_file_part_id,
  kind,
  schema_version,
  hash,
  size_bytes,
  mime_type,
  content_encoding,
  object_key,
  original_filename,
  created_at,
  updated_at
)
SELECT
  @id, @log_group_id, sqlc.narg('log_file_part_id')::uuid, @kind,
  @schema_version, @hash, @size_bytes, @mime_type, @content_encoding,
  @object_key, @original_filename, @created_at, @updated_at
WHERE sqlc.narg('log_file_part_id')::uuid IS NULL
   OR EXISTS (
     SELECT 1
     FROM log_file_parts parts
     JOIN log_file files ON files.id = parts.log_file_id
     WHERE parts.id = sqlc.narg('log_file_part_id')::uuid
       AND files.wow_log_id = @log_group_id
   )
RETURNING *;

-- name: ListLogGroupArtifacts :many
SELECT *
FROM log_group_artifacts
WHERE log_group_id = $1
  AND storage_deleted_at IS NULL
ORDER BY created_at, id;

-- name: ListLogGroupArtifactsForParse :many
SELECT artifacts.*
FROM log_group_artifacts artifacts
LEFT JOIN log_file_parts parts ON parts.id = artifacts.log_file_part_id
WHERE artifacts.log_group_id = @log_group_id
  AND artifacts.storage_deleted_at IS NULL
ORDER BY artifacts.log_file_part_id IS NOT NULL,
         parts.source_sequence IS NULL,
         COALESCE(parts.source_sequence, parts.sequence),
         parts.sequence,
         artifacts.created_at,
         artifacts.id;

-- name: GetLogGroupArtifacts :many
SELECT *
FROM log_group_artifacts
WHERE log_group_id = $1
ORDER BY created_at, id;

-- name: GetLogGroupArtifact :one
SELECT *
FROM log_group_artifacts
WHERE log_group_id = $1
  AND id = $2;

-- name: MarkLogGroupArtifactsStorageDeleted :many
UPDATE log_group_artifacts
SET storage_deleted_at = $1,
    updated_at = $1
WHERE log_group_id = $2
  AND storage_deleted_at IS NULL
RETURNING *;
