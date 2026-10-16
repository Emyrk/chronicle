-- name: GetWoWLogGroupPrivacy :one
SELECT private
FROM wow_log_groups
WHERE id = $1;

-- name: UpdateWoWLogGroupPrivacy :one
UPDATE wow_log_groups
SET private = @private,
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: CreatePrivateLogShareLink :one
INSERT INTO private_log_share_links (id, log_group_id, code, created_by)
VALUES (@id, @log_group_id, @code, @created_by)
RETURNING *;

-- name: GetActivePrivateLogShareLinkByCode :one
SELECT
  sqlc.embed(private_log_share_links),
  wlg.private,
  wlg.owner,
  u.username AS owner_name
FROM private_log_share_links
JOIN wow_log_groups wlg ON wlg.id = private_log_share_links.log_group_id
JOIN users u ON u.id = wlg.owner
WHERE private_log_share_links.code = $1
  AND private_log_share_links.revoked_at IS NULL;

-- name: RevokePrivateLogShareLink :execrows
UPDATE private_log_share_links
SET revoked_at = NOW()
WHERE id = @id
  AND log_group_id = @log_group_id
  AND revoked_at IS NULL;

-- name: UpsertPrivateLogAccessRequest :one
INSERT INTO private_log_access_requests (
  id,
  log_group_id,
  share_link_id,
  requester_id
)
VALUES (@id, @log_group_id, @share_link_id, @requester_id)
ON CONFLICT (log_group_id, requester_id) DO UPDATE
SET
  share_link_id = EXCLUDED.share_link_id,
  status = CASE
    WHEN private_log_access_requests.status = 'approved' THEN 'approved'
    ELSE 'pending'
  END,
  updated_at = NOW(),
  decided_by = CASE
    WHEN private_log_access_requests.status = 'approved' THEN private_log_access_requests.decided_by
    ELSE NULL
  END,
  decided_at = CASE
    WHEN private_log_access_requests.status = 'approved' THEN private_log_access_requests.decided_at
    ELSE NULL
  END
RETURNING *;

-- name: GetPrivateLogAccessRequestForUser :one
SELECT *
FROM private_log_access_requests
WHERE log_group_id = @log_group_id
  AND requester_id = @requester_id;

-- name: GetPrivateLogAccessRequestByID :one
SELECT *
FROM private_log_access_requests
WHERE id = $1;

-- name: ListPrivateLogAccessRequests :many
SELECT
  sqlc.embed(private_log_access_requests),
  u.username AS requester_name
FROM private_log_access_requests
JOIN users u ON u.id = private_log_access_requests.requester_id
WHERE private_log_access_requests.log_group_id = $1
ORDER BY private_log_access_requests.created_at ASC;

-- name: ApprovePrivateLogAccessRequest :one
UPDATE private_log_access_requests
SET
  status = 'approved',
  updated_at = NOW(),
  decided_by = @decided_by,
  decided_at = NOW()
WHERE id = @id
  AND log_group_id = @log_group_id
RETURNING *;

-- name: DenyPrivateLogAccessRequest :one
UPDATE private_log_access_requests
SET
  status = 'denied',
  updated_at = NOW(),
  decided_by = @decided_by,
  decided_at = NOW()
WHERE id = @id
  AND log_group_id = @log_group_id
  AND status <> 'approved'
RETURNING *;

-- name: RevokePrivateLogAccessRequest :one
UPDATE private_log_access_requests
SET
  status = 'revoked',
  updated_at = NOW(),
  decided_by = @decided_by,
  decided_at = NOW()
WHERE id = @id
  AND log_group_id = @log_group_id
  AND status = 'approved'
RETURNING *;
