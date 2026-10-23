-- name: GetRetentionRecalculationCandidates :many
SELECT
  li.id,
  li.log_group_id,
  li.end_time,
  li.category,
  li.retention_policy_key,
  wlg.owner,
  wlg.flavor,
  EXISTS (
    SELECT 1 FROM billing_entitlements be
    WHERE be.user_id = wlg.owner AND be.entitlement_key = 'chronicle-honored'
  ) AS has_honored,
  EXISTS (
    SELECT 1 FROM billing_entitlements be
    WHERE be.user_id = wlg.owner AND be.entitlement_key = 'chronicle-revered'
  ) AS has_revered,
  EXISTS (
    SELECT 1 FROM billing_entitlements be
    WHERE be.user_id = wlg.owner AND be.entitlement_key = 'chronicle-exalted'
  ) AS has_exalted
FROM log_instances li
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
WHERE li.end_time IS NOT NULL
  AND li.id > @cursor_id::uuid
ORDER BY li.id
LIMIT @page_size;

-- name: UpdateLogInstanceRetentionExpiry :exec
UPDATE log_instances
SET retention_expires_at = @retention_expires_at
WHERE id = @id;

-- name: GetExpiredRetentionCandidates :many
SELECT id, log_group_id, retention_expires_at
FROM log_instances
WHERE retention_expires_at IS NOT NULL
  AND retention_expires_at <= @now
  AND (
    retention_expires_at > @cursor_expires_at
    OR (retention_expires_at = @cursor_expires_at AND id > @cursor_id::uuid)
  )
ORDER BY retention_expires_at, id
LIMIT @page_size;

-- name: GetAuthoritativeRetentionCandidate :one
SELECT
  li.id,
  li.log_group_id,
  li.end_time,
  li.category,
  li.retention_policy_key,
  li.retention_expires_at,
  wlg.owner,
  wlg.flavor,
  EXISTS (
    SELECT 1 FROM billing_entitlements be
    WHERE be.user_id = wlg.owner AND be.entitlement_key = 'chronicle-honored'
  ) AS has_honored,
  EXISTS (
    SELECT 1 FROM billing_entitlements be
    WHERE be.user_id = wlg.owner AND be.entitlement_key = 'chronicle-revered'
  ) AS has_revered,
  EXISTS (
    SELECT 1 FROM billing_entitlements be
    WHERE be.user_id = wlg.owner AND be.entitlement_key = 'chronicle-exalted'
  ) AS has_exalted
FROM log_instances li
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
WHERE li.id = @id
FOR UPDATE OF li, wlg;

-- name: IsRetentionProtectedSpeedrun :one
-- Protect every tied fastest qualified public speedrun for its guild, realm, or
-- server board. Boards are split by instance, difficulty, and declared size.
WITH candidate AS (
  SELECT
    sr.instance_id,
    sr.guild_id,
    sr.realm_id,
    wsr.server_id,
    sr.instance_name,
    li.difficulty_name,
    li.max_players,
    COALESCE(sr.ranked_duration_ms, sr.duration_ms)::bigint AS duration_ms
  FROM instance_speedruns sr
  JOIN log_instances li ON li.id = sr.instance_id
  JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
  JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
  LEFT JOIN leaderboard_version_requirements lvr ON lvr.instance_name = sr.instance_name
  WHERE sr.instance_id = @instance_id
    AND sr.qualified = true
    AND sr.guild_id IS NOT NULL
    AND sr.parser_version_num >= COALESCE(lvr.min_parser_version_num, 0)
    AND sr.addon_version_num >= COALESCE(lvr.min_addon_version_num, 0)
    AND COALESCE(sr.ranked_duration_ms, sr.duration_ms) > 0
),
eligible AS (
  SELECT
    sr.guild_id,
    sr.realm_id,
    wsr.server_id,
    COALESCE(sr.ranked_duration_ms, sr.duration_ms)::bigint AS duration_ms
  FROM candidate c
  JOIN instance_speedruns sr ON sr.instance_name = c.instance_name
  JOIN log_instances li ON li.id = sr.instance_id
  JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
  JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
  LEFT JOIN leaderboard_version_requirements lvr ON lvr.instance_name = sr.instance_name
  WHERE li.difficulty_name = c.difficulty_name
    AND li.max_players = c.max_players
    AND sr.qualified = true
    AND sr.guild_id IS NOT NULL
    AND sr.parser_version_num >= COALESCE(lvr.min_parser_version_num, 0)
    AND sr.addon_version_num >= COALESCE(lvr.min_addon_version_num, 0)
    AND COALESCE(sr.ranked_duration_ms, sr.duration_ms) > 0
)
SELECT EXISTS (
  SELECT 1
  FROM candidate c
  WHERE c.duration_ms = (
      SELECT MIN(e.duration_ms) FROM eligible e WHERE e.guild_id = c.guild_id
    )
    OR c.duration_ms = (
      SELECT MIN(e.duration_ms) FROM eligible e WHERE e.realm_id = c.realm_id
    )
    OR c.duration_ms = (
      SELECT MIN(e.duration_ms) FROM eligible e WHERE e.server_id = c.server_id
    )
);

-- name: DeleteLogInstancesByIDs :execrows
DELETE FROM log_instances
WHERE id = ANY(@ids::uuid[]);

-- name: DeleteParsedLogInstance :execrows
DELETE FROM log_instances
WHERE id = @id;
