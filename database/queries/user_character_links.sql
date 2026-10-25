-- name: InsertUserCharacterLink :one
INSERT INTO user_character_links (user_id, character_guid, realm_id, linked_by, link_source)
VALUES ($1, $2, $3, $4, COALESCE(NULLIF(@link_source::text, ''), 'manual'))
RETURNING *;

-- name: DeleteUserCharacterLinksByUserAndSource :many
DELETE FROM user_character_links
WHERE user_id = $1 AND link_source = $2
RETURNING *;

-- name: GetExternalCharacterLinkSync :one
SELECT * FROM external_character_link_syncs
WHERE user_id = $1 AND source = $2;

-- name: UpsertExternalCharacterLinkSync :exec
-- Refreshes the rate-limit timestamp. Clears the cached response: it is
-- stale once a new sync starts, and stays NULL if the sync fails.
INSERT INTO external_character_link_syncs (user_id, source, last_synced_at, last_response)
VALUES ($1, $2, now(), NULL)
ON CONFLICT (user_id, source) DO UPDATE SET last_synced_at = now(), last_response = NULL;

-- name: UpdateExternalCharacterLinkSyncResponse :exec
UPDATE external_character_link_syncs
SET last_response = $3
WHERE user_id = $1 AND source = $2;

-- name: DeleteUserCharacterLink :one
DELETE FROM user_character_links
WHERE character_guid = $1 AND realm_id = $2
RETURNING *;

-- name: GetUserCharacterLink :one
SELECT * FROM user_character_links
WHERE character_guid = $1 AND realm_id = $2;

-- name: GetUserCharacterLinks :many
SELECT
  ucl.id AS link_id,
  ucl.user_id,
  ucl.is_primary,
  ucl.link_source,
  ucl.created_at AS linked_at,
  gp.id AS character_guid,
  gp.realm_id,
  gp.name,
  gp.class,
  gp.race,
  gp.gender,
  gp.level,
  COALESCE(wow_server_realms.name, 'Unknown') AS realm_name,
  g.name AS guild_name
FROM user_character_links ucl
JOIN game_players gp ON gp.id = ucl.character_guid AND gp.realm_id = ucl.realm_id
JOIN wow_server_realms ON wow_server_realms.id = ucl.realm_id
LEFT JOIN guilds g ON g.id = gp.guild_id
WHERE ucl.user_id = $1
ORDER BY ucl.is_primary DESC, ucl.created_at ASC;

-- name: UnsetPrimaryUserCharacter :exec
UPDATE user_character_links
SET is_primary = FALSE
WHERE user_id = $1 AND is_primary;

-- name: SetPrimaryUserCharacter :one
UPDATE user_character_links
SET is_primary = TRUE
WHERE user_id = $1 AND character_guid = $2 AND realm_id = $3
RETURNING *;

-- name: UpsertUserCharacterCosmetics :one
INSERT INTO user_character_cosmetics (
  user_character_link_id,
  requested_name_id,
  requested_background_id,
  requested_border_id,
  active_name_id,
  active_background_id,
  active_border_id
)
SELECT
  @user_character_link_id,
  @requested_name_id,
  @requested_background_id,
  @requested_border_id,
  @active_name_id,
  @active_background_id,
  @active_border_id
FROM user_character_links
WHERE id = @user_character_link_id AND user_id = @user_id
ON CONFLICT (user_character_link_id) DO UPDATE SET
  requested_name_id = EXCLUDED.requested_name_id,
  requested_background_id = EXCLUDED.requested_background_id,
  requested_border_id = EXCLUDED.requested_border_id,
  active_name_id = EXCLUDED.active_name_id,
  active_background_id = EXCLUDED.active_background_id,
  active_border_id = EXCLUDED.active_border_id
RETURNING *;

-- name: GetUserCharacterCosmetics :many
SELECT user_character_cosmetics.*
FROM user_character_cosmetics
JOIN user_character_links
  ON user_character_links.id = user_character_cosmetics.user_character_link_id
WHERE user_character_links.user_id = $1
ORDER BY user_character_links.created_at ASC;

-- name: UpdateUserCharacterActiveCosmetics :one
UPDATE user_character_cosmetics
SET
  active_name_id = @active_name_id,
  active_background_id = @active_background_id,
  active_border_id = @active_border_id
FROM user_character_links
WHERE user_character_cosmetics.user_character_link_id = @user_character_link_id
  AND user_character_links.id = user_character_cosmetics.user_character_link_id
  AND user_character_links.user_id = @user_id
RETURNING user_character_cosmetics.*;

-- name: GetInstancePlayerCosmetics :many
SELECT
  log_instance_players.unit_guid,
  user_character_cosmetics.active_name_id,
  user_character_cosmetics.active_background_id,
  user_character_cosmetics.active_border_id
FROM log_instance_players
JOIN log_instances
  ON log_instances.id = log_instance_players.instance_id
JOIN user_character_links
  ON user_character_links.character_guid = log_instance_players.unit_guid
  AND user_character_links.realm_id = log_instances.realm_id
JOIN user_character_cosmetics
  ON user_character_cosmetics.user_character_link_id = user_character_links.id
WHERE log_instance_players.instance_id = @instance_id
  AND (
    user_character_cosmetics.active_name_id <> ''
    OR user_character_cosmetics.active_background_id <> ''
    OR user_character_cosmetics.active_border_id <> ''
  )
ORDER BY log_instance_players.unit_guid;

-- name: ListUsersWithCharacterCosmetics :many
SELECT DISTINCT user_character_links.user_id
FROM user_character_cosmetics
JOIN user_character_links
  ON user_character_links.id = user_character_cosmetics.user_character_link_id
ORDER BY user_character_links.user_id;

-- name: ListUsersReferencingCosmetic :many
SELECT DISTINCT user_character_links.user_id
FROM user_character_cosmetics
JOIN user_character_links
  ON user_character_links.id = user_character_cosmetics.user_character_link_id
WHERE @cosmetic_id::text <> '' AND @cosmetic_id::text IN (
  user_character_cosmetics.requested_name_id,
  user_character_cosmetics.requested_background_id,
  user_character_cosmetics.requested_border_id,
  user_character_cosmetics.active_name_id,
  user_character_cosmetics.active_background_id,
  user_character_cosmetics.active_border_id
)
ORDER BY user_character_links.user_id;
