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
