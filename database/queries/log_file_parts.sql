-- name: LockLogFilePartSequence :one
SELECT log_file.id
FROM log_file
WHERE log_file.id = sqlc.arg('log_file_id')
FOR UPDATE;

-- name: ReserveLogFilePart :one
INSERT INTO log_file_parts (
    id, log_file_id, sequence, upload_id, reservation_id, source_sequence, object_key, status
)
VALUES (
    @part_id,
    @log_file_id,
    (SELECT COALESCE(MAX(sequence), 0) + 1 FROM log_file_parts WHERE log_file_id = @log_file_id),
    @upload_id,
    @reservation_id,
    sqlc.narg('source_sequence')::bigint,
    @object_key,
    'pending'
)
ON CONFLICT (log_file_id, upload_id) DO UPDATE
SET status = CASE
        WHEN log_file_parts.status = 'failed' THEN 'pending'
        ELSE log_file_parts.status
    END,
    reservation_id = CASE
        WHEN log_file_parts.status = 'failed' THEN EXCLUDED.reservation_id
        ELSE log_file_parts.reservation_id
    END,
    object_key = CASE
        WHEN log_file_parts.status = 'failed' THEN EXCLUDED.object_key
        ELSE log_file_parts.object_key
    END,
    created_at = CASE
        WHEN log_file_parts.status = 'failed' THEN now()
        ELSE log_file_parts.created_at
    END
RETURNING *;

-- name: FinalizeLogFilePart :one
UPDATE log_file_parts
SET status = 'ready',
    hash = @hash,
    size_bytes = @size_bytes,
    compressed_size_bytes = @compressed_size_bytes,
    content_encoding = @content_encoding,
    finalized_at = now()
WHERE id = @id
  AND reservation_id = @reservation_id
  AND status = 'pending'
RETURNING *;

-- name: GetLogFilePart :one
SELECT *
FROM log_file_parts
WHERE id = @id;

-- name: ExpireStaleLogFileParts :many
UPDATE log_file_parts
SET status = 'failed'
WHERE log_file_id = @log_file_id
  AND status = 'pending'
  AND created_at < @stale_before
RETURNING *;

-- name: ListReadyLogFileParts :many
SELECT part.*
FROM log_file_parts part
WHERE part.log_file_id = @log_file_id
  AND part.status = 'ready'
  AND NOT EXISTS (
      SELECT 1
      FROM log_file_parts earlier
      WHERE earlier.log_file_id = part.log_file_id
        AND (
            earlier.source_sequence IS NULL,
            COALESCE(earlier.source_sequence, earlier.sequence),
            earlier.sequence
        ) < (
            part.source_sequence IS NULL,
            COALESCE(part.source_sequence, part.sequence),
            part.sequence
        )
        AND earlier.status = 'pending'
  )
ORDER BY part.source_sequence IS NULL,
         COALESCE(part.source_sequence, part.sequence),
         part.sequence,
         part.id;

-- name: ListLogFilePartsForDeletion :many
SELECT *
FROM log_file_parts
WHERE log_file_id = @log_file_id
ORDER BY sequence, id;

-- name: AddReadyLogFilePartSizes :exec
-- size_bytes is the logical uncompressed size. compressed_size_bytes remains
-- NULL when the base object is not compressed; hash continues to identify the
-- immutable base object, while each append part carries its own hash.
UPDATE log_file
SET size_bytes = size_bytes + @size_bytes,
    compressed_size_bytes = CASE
        WHEN compressed_size_bytes IS NULL THEN NULL
        ELSE compressed_size_bytes + @compressed_size_bytes
    END,
    updated_at = now()
WHERE id = @id;

-- name: MarkLogFilePartFailed :exec
UPDATE log_file_parts
SET status = 'failed'
WHERE id = @id
  AND reservation_id = @reservation_id
  AND status = 'pending';
