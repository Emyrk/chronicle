-- name: InsertDiscordMembershipGrantCheck :one
INSERT INTO discord_membership_grant_checks (user_id, next_check_at)
VALUES (sqlc.arg(user_id), sqlc.arg(next_check_at))
ON CONFLICT (user_id) DO NOTHING
RETURNING *;

-- name: RepairDiscordMembershipGrantChecks :many
WITH missing AS (
  SELECT DISTINCT links.user_id
  FROM user_auth_links AS links
  LEFT JOIN discord_membership_grant_checks AS checks ON checks.user_id = links.user_id
  WHERE links.provider = 'discord'
    AND checks.user_id IS NULL
  ORDER BY links.user_id
  LIMIT sqlc.arg(limit_count)
)
INSERT INTO discord_membership_grant_checks (user_id, next_check_at)
SELECT
  user_id,
  sqlc.arg(check_time)::TIMESTAMPTZ
    + ((('x' || SUBSTRING(MD5(user_id::TEXT), 1, 8))::BIT(32)::BIGINT % 604800) * INTERVAL '1 second')
FROM missing
ON CONFLICT (user_id) DO NOTHING
RETURNING *;

-- name: ClaimDueDiscordMembershipGrantChecks :many
WITH candidates AS (
  SELECT checks.user_id, checks.next_check_at
  FROM discord_membership_grant_checks AS checks
  WHERE checks.next_check_at <= sqlc.arg(check_time)::TIMESTAMPTZ
    AND checks.suspended_until_login = FALSE
    AND (checks.claim_token IS NULL OR checks.claim_expires_at <= sqlc.arg(check_time)::TIMESTAMPTZ)
    AND EXISTS (
      SELECT 1
      FROM user_auth_links AS links
      WHERE links.user_id = checks.user_id
        AND links.provider = 'discord'
    )
  ORDER BY checks.next_check_at, checks.user_id
  FOR UPDATE SKIP LOCKED
  LIMIT sqlc.arg(limit_count)
)
UPDATE discord_membership_grant_checks AS checks
SET
  claim_token = gen_random_uuid(),
  claim_expires_at = sqlc.arg(check_time)::TIMESTAMPTZ + INTERVAL '24 hours',
  updated_at = sqlc.arg(check_time)::TIMESTAMPTZ
FROM candidates
WHERE checks.user_id = candidates.user_id
RETURNING checks.user_id, checks.claim_token, candidates.next_check_at;

-- name: GetDiscordMembershipGrantCheckClaim :one
SELECT checks.*
FROM discord_membership_grant_checks AS checks
WHERE checks.user_id = sqlc.arg(user_id)
  AND checks.claim_token = sqlc.arg(claim_token)
  AND checks.claim_expires_at > sqlc.arg(check_time)::TIMESTAMPTZ;

-- name: CompleteDiscordMembershipGrantCheckMember :one
UPDATE discord_membership_grant_checks
SET
  next_check_at = sqlc.arg(checked_at)::TIMESTAMPTZ + INTERVAL '7 days',
  last_attempt_at = sqlc.arg(checked_at)::TIMESTAMPTZ,
  last_success_at = sqlc.arg(checked_at)::TIMESTAMPTZ,
  is_member = TRUE,
  last_outcome = 'member',
  last_error = NULL,
  suspended_until_login = FALSE,
  claim_token = NULL,
  claim_expires_at = NULL,
  updated_at = sqlc.arg(checked_at)::TIMESTAMPTZ
WHERE user_id = sqlc.arg(user_id)
  AND claim_token = sqlc.arg(claim_token)
RETURNING *;

-- name: CompleteDiscordMembershipGrantCheckNonMember :one
UPDATE discord_membership_grant_checks
SET
  next_check_at = sqlc.arg(checked_at)::TIMESTAMPTZ + INTERVAL '7 days',
  last_attempt_at = sqlc.arg(checked_at)::TIMESTAMPTZ,
  last_success_at = sqlc.arg(checked_at)::TIMESTAMPTZ,
  is_member = FALSE,
  last_outcome = 'non_member',
  last_error = NULL,
  suspended_until_login = FALSE,
  claim_token = NULL,
  claim_expires_at = NULL,
  updated_at = sqlc.arg(checked_at)::TIMESTAMPTZ
WHERE user_id = sqlc.arg(user_id)
  AND claim_token = sqlc.arg(claim_token)
RETURNING *;

-- name: CompleteDiscordMembershipGrantCheckError :one
UPDATE discord_membership_grant_checks
SET
  last_attempt_at = sqlc.arg(checked_at)::TIMESTAMPTZ,
  last_outcome = 'error',
  last_error = sqlc.arg(last_error),
  suspended_until_login = TRUE,
  claim_token = NULL,
  claim_expires_at = NULL,
  updated_at = sqlc.arg(checked_at)::TIMESTAMPTZ
WHERE user_id = sqlc.arg(user_id)
  AND claim_token = sqlc.arg(claim_token)
RETURNING *;

-- name: ReactivateDiscordMembershipGrantCheck :one
UPDATE discord_membership_grant_checks
SET
  suspended_until_login = FALSE,
  last_error = NULL,
  claim_token = gen_random_uuid(),
  claim_expires_at = sqlc.arg(check_time)::TIMESTAMPTZ + INTERVAL '24 hours',
  updated_at = sqlc.arg(check_time)::TIMESTAMPTZ
WHERE user_id = sqlc.arg(user_id)
  AND suspended_until_login = TRUE
RETURNING user_id, claim_token, next_check_at;

-- name: ActivateDiscordMembershipGrantCheckOnLogin :one
INSERT INTO discord_membership_grant_checks (
  user_id,
  next_check_at,
  claim_token,
  claim_expires_at
)
VALUES (
  sqlc.arg(user_id),
  sqlc.arg(check_time)::TIMESTAMPTZ,
  gen_random_uuid(),
  sqlc.arg(check_time)::TIMESTAMPTZ + INTERVAL '24 hours'
)
ON CONFLICT (user_id) DO UPDATE SET
  suspended_until_login = FALSE,
  last_error = NULL,
  claim_token = gen_random_uuid(),
  claim_expires_at = sqlc.arg(check_time)::TIMESTAMPTZ + INTERVAL '24 hours',
  updated_at = sqlc.arg(check_time)::TIMESTAMPTZ
WHERE discord_membership_grant_checks.suspended_until_login = TRUE
  AND (
    discord_membership_grant_checks.claim_token IS NULL
    OR discord_membership_grant_checks.claim_expires_at <= sqlc.arg(check_time)::TIMESTAMPTZ
  )
RETURNING user_id, claim_token, next_check_at;

-- name: UpsertDiscordMembershipGrantCheckMember :one
INSERT INTO discord_membership_grant_checks (
  user_id,
  next_check_at,
  last_attempt_at,
  last_success_at,
  is_member,
  last_outcome
)
VALUES (
  sqlc.arg(user_id),
  sqlc.arg(checked_at)::TIMESTAMPTZ + INTERVAL '7 days',
  sqlc.arg(checked_at)::TIMESTAMPTZ,
  sqlc.arg(checked_at)::TIMESTAMPTZ,
  TRUE,
  'member'
)
ON CONFLICT (user_id) DO UPDATE SET
  next_check_at = EXCLUDED.next_check_at,
  last_attempt_at = EXCLUDED.last_attempt_at,
  last_success_at = EXCLUDED.last_success_at,
  is_member = TRUE,
  last_outcome = 'member',
  last_error = NULL,
  suspended_until_login = FALSE,
  claim_token = NULL,
  claim_expires_at = NULL,
  updated_at = EXCLUDED.last_attempt_at
RETURNING *;

-- name: UpsertDiscordMembershipGrantCheckNonMember :one
INSERT INTO discord_membership_grant_checks (
  user_id,
  next_check_at,
  last_attempt_at,
  last_success_at,
  is_member,
  last_outcome
)
VALUES (
  sqlc.arg(user_id),
  sqlc.arg(checked_at)::TIMESTAMPTZ + INTERVAL '7 days',
  sqlc.arg(checked_at)::TIMESTAMPTZ,
  sqlc.arg(checked_at)::TIMESTAMPTZ,
  FALSE,
  'non_member'
)
ON CONFLICT (user_id) DO UPDATE SET
  next_check_at = EXCLUDED.next_check_at,
  last_attempt_at = EXCLUDED.last_attempt_at,
  last_success_at = EXCLUDED.last_success_at,
  is_member = FALSE,
  last_outcome = 'non_member',
  last_error = NULL,
  suspended_until_login = FALSE,
  claim_token = NULL,
  claim_expires_at = NULL,
  updated_at = EXCLUDED.last_attempt_at
RETURNING *;

-- name: UpsertDiscordMembershipGrantCheckError :one
INSERT INTO discord_membership_grant_checks (
  user_id,
  next_check_at,
  last_attempt_at,
  last_outcome,
  last_error,
  suspended_until_login
)
VALUES (
  sqlc.arg(user_id),
  sqlc.arg(checked_at)::TIMESTAMPTZ,
  sqlc.arg(checked_at)::TIMESTAMPTZ,
  'error',
  sqlc.arg(last_error),
  TRUE
)
ON CONFLICT (user_id) DO UPDATE SET
  last_attempt_at = EXCLUDED.last_attempt_at,
  last_outcome = 'error',
  last_error = EXCLUDED.last_error,
  suspended_until_login = TRUE,
  claim_token = NULL,
  claim_expires_at = NULL,
  updated_at = EXCLUDED.last_attempt_at
RETURNING *;

-- name: ClearDiscordMembershipGrantCheckClaim :execrows
UPDATE discord_membership_grant_checks
SET
  claim_token = NULL,
  claim_expires_at = NULL,
  updated_at = sqlc.arg(check_time)::TIMESTAMPTZ
WHERE user_id = sqlc.arg(user_id)
  AND claim_token = sqlc.arg(claim_token);

-- name: DeleteDiscordMembershipGrantCheck :exec
DELETE FROM discord_membership_grant_checks
WHERE user_id = sqlc.arg(user_id);
