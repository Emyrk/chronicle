-- name: InsertUser :one
INSERT INTO
  users(id, username, email, created_at, updated_at)
VALUES
  ($1, $2, $3, $4, $5)
RETURNING *
;

-- name: InsertUserAuth :one
INSERT INTO
  user_auth_links(id, linked_id, user_id, provider, created_at, updated_at)
VALUES
  ($1, $2, $3, $4, $5, $6)
RETURNING *
;

-- name: GetUserAuthByLinkedID :one
SELECT
  *
FROM
  user_auth_links
WHERE
  linked_id = $1 AND
  provider = $2
;


-- name: InsertUserAuthSession :one
INSERT INTO
  user_auth_session(id, user_id, user_auth_id, access_token, access_token_secret, refresh_token, expires_at, created_at, updated_at, jwt_id)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *
;

-- name: GetUserAuthSessionByID :one
SELECT
  *
FROM
  user_auth_session
WHERE
  id = $1
FOR UPDATE ;

-- name: UpdateUserAuthSessionTokens :one
UPDATE
  user_auth_session
SET
  access_token = $2,
  access_token_secret = $3,
  refresh_token = $4,
  expires_at = $5,
  updated_at = $6,
  jwt_id = $7
WHERE
  id = $1
RETURNING *
;

-- name: GetUserByID :one
SELECT
  *
FROM
  chronicle_users
WHERE
  id = $1
;

-- name: ListAllUsers :many
SELECT
  *
FROM
  chronicle_users
ORDER BY
  created_at DESC
;

-- name: SetUserStorageLimit :one
UPDATE
  data_limit
SET
  max_storage_bytes = $2,
  updated_at = $3
WHERE
  user_id = $1
RETURNING *
;

-- name: GetUserAuthLinkByUserID :one
SELECT
  *
FROM
  user_auth_links
WHERE
  user_id = $1
LIMIT 1
;