-- name: InsertLogGroupArtifact :one
INSERT INTO log_group_artifacts (
  id,
  log_group_id,
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
VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
)
RETURNING *;

-- name: ListLogGroupArtifacts :many
SELECT *
FROM log_group_artifacts
WHERE log_group_id = $1
  AND storage_deleted_at IS NULL
ORDER BY created_at, id;

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
