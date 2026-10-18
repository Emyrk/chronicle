-- name: GetWoWLogGroupUnlisted :one
SELECT unlisted
FROM wow_log_groups
WHERE id = $1;

-- name: MarkWoWLogGroupUnlisted :one
UPDATE wow_log_groups
SET unlisted = true,
    updated_at = NOW()
WHERE id = @id
RETURNING *;
