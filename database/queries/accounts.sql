-- name: LockUsersForUpdate :many
SELECT id FROM users
WHERE id = ANY(@ids::uuid[])
ORDER BY id
FOR UPDATE;

-- GetAccountDataCounts counts the data an account purge removes, grouped into
-- sets the user must acknowledge individually. Zero counts are omitted.
-- name: GetAccountDataCounts :many
SELECT data.group_key::text AS group_key, data.label::text AS label, data.count::bigint AS count
FROM (VALUES
  ('logs', 'Uploaded logs', (SELECT count(*) FROM wow_log_groups t WHERE t.owner = @user_id::uuid)),
  ('characters', 'Linked characters', (SELECT count(*) FROM user_character_links t WHERE t.user_id = @user_id::uuid)),
  ('gear', 'Gear lists', (SELECT count(*) FROM gear_lists t WHERE t.user_id = @user_id::uuid)),
  ('gear', 'Gear progressions', (SELECT count(*) FROM gear_progressions t WHERE t.user_id = @user_id::uuid)),
  ('gear', 'Stat weights', (SELECT count(*) FROM gear_stat_weights t WHERE t.user_id = @user_id::uuid)),
  ('gear', 'Raid compositions', (SELECT count(*) FROM raid_compositions t WHERE t.user_id = @user_id::uuid)),
  ('gear', 'Talent builds', (SELECT count(*) FROM user_talent_builds t WHERE t.user_id = @user_id::uuid)),
  ('layouts', 'Panel layouts', (SELECT count(*) FROM user_panel_layouts t WHERE t.user_id = @user_id::uuid)),
  ('layouts', 'Tracked layouts', (SELECT count(*) FROM user_tracked_layouts t WHERE t.user_id = @user_id::uuid)),
  ('layouts', 'Action bar settings', (SELECT count(*) FROM user_action_bar_slots t WHERE t.user_id = @user_id::uuid)),
  ('layouts', 'Custom panel settings', (SELECT count(*) FROM user_custom_panel_settings t WHERE t.user_id = @user_id::uuid)),
  ('layouts', 'Custom panel installs', (SELECT count(*) FROM user_custom_panel_installations t WHERE t.user_id = @user_id::uuid)),
  ('favorites', 'Favorite guilds', (SELECT count(*) FROM user_favorite_guilds t WHERE t.user_id = @user_id::uuid)),
  ('favorites', 'Favorite players', (SELECT count(*) FROM user_favorite_players t WHERE t.user_id = @user_id::uuid)),
  ('ai', 'AI provider connections', (SELECT count(*) FROM inference_connections t WHERE t.user_id = @user_id::uuid)),
  ('ai', 'AI chats', (SELECT count(*) FROM inference_threads t WHERE t.user_id = @user_id::uuid)),
  ('ai', 'AI settings', (SELECT count(*) FROM inference_user_config t WHERE t.user_id = @user_id::uuid)),
  ('sidekick', 'Sidekick installs', (SELECT count(*) FROM sidekick_installations t WHERE t.user_id = @user_id::uuid)),
  ('sidekick', 'Sidekick settings', (SELECT count(*) FROM sidekick_account_configs t WHERE t.user_id = @user_id::uuid)),
  ('modules', 'Published modules', (SELECT count(*) FROM lua_projects t WHERE t.owner_id = @user_id::uuid)),
  ('modules', 'Module author profile', (SELECT count(*) FROM addon_authors t WHERE t.user_id = @user_id::uuid)),
  ('modules', 'Module contributor seats', (SELECT count(*) FROM lua_project_contributors t WHERE t.user_id = @user_id::uuid)),
  ('modules', 'Starred modules', (SELECT count(*) FROM lua_project_stars t WHERE t.user_id = @user_id::uuid)),
  ('community', 'Guild Discord bot installs', (SELECT count(*) FROM guild_discord_installations t WHERE t.installed_by = @user_id::uuid)),
  ('community', 'Guild join requests', (SELECT count(*) FROM guild_join_requests t WHERE t.user_id = @user_id::uuid)),
  ('community', 'Server applications', (SELECT count(*) FROM server_applications t WHERE t.initiated_by = @user_id::uuid)),
  ('community', 'Server upload keys', (SELECT count(*) FROM wow_server_upload_keys t WHERE t.created_by = @user_id::uuid)),
  ('community', 'Shared views', (SELECT count(*) FROM shared_views t WHERE t.created_by = @user_id::uuid)),
  ('billing', 'Supporter entitlements', (SELECT count(*) FROM billing_entitlements t WHERE t.user_id = @user_id::uuid)),
  ('billing', 'Bonus storage grants', (SELECT count(*) FROM data_grants t WHERE t.user_id = @user_id::uuid AND t.source <> 'base')),
  ('billing', 'Photo proof requests', (SELECT count(*) FROM proof_requests t WHERE t.applicant_id = @user_id::uuid))
) AS data(group_key, label, count)
WHERE data.count > 0;

-- name: DeleteUserAuthSessionsByUserID :exec
DELETE FROM user_auth_session WHERE user_id = @user_id;

-- name: DeleteUserAuthLinksByUserID :exec
DELETE FROM user_auth_links WHERE user_id = @user_id;

-- name: DeleteUserAccountRow :execrows
DELETE FROM users WHERE id = @user_id;

-- GetAccountDeletionBlockers lists what must be resolved before an account can
-- be deleted. Servers and realms hold other players' logs and rankings.
-- name: GetAccountDeletionBlockers :one
SELECT ARRAY_REMOVE(ARRAY[
  CASE WHEN EXISTS (SELECT 1 FROM billing_subscriptions t WHERE t.user_id = @user_id::uuid AND t.status NOT IN ('canceled', 'incomplete_expired')) THEN 'active subscription' END,
  CASE WHEN EXISTS (SELECT 1 FROM wow_servers t WHERE t.created_by = @user_id::uuid) THEN 'created servers' END,
  CASE WHEN EXISTS (SELECT 1 FROM wow_server_realms t WHERE t.created_by = @user_id::uuid) THEN 'created realms' END
], NULL)::text[] AS blockers;

-- name: ListOwnedLogGroupIDs :many
SELECT id FROM wow_log_groups WHERE owner = @user_id;

-- Files the user appended to someone else's log group belong to that raid.
-- name: ReassignAppendedLogFilesToGroupOwner :exec
UPDATE log_file
SET owner = wow_log_groups.owner
FROM wow_log_groups
WHERE log_file.wow_log_id = wow_log_groups.id
  AND log_file.owner = @user_id::uuid
  AND wow_log_groups.owner <> @user_id::uuid;

-- name: ListOwnedLuaProjectIDs :many
SELECT id FROM lua_projects WHERE owner_id = @user_id;

-- name: ListUploadKeyIDsCreatedByUser :many
SELECT id FROM wow_server_upload_keys WHERE created_by = @user_id;

-- name: ListGuildIDsWithDiscordInstalledByUser :many
SELECT guild_id FROM guild_discord_installations WHERE installed_by = @user_id;

-- name: DeleteServerApplicationsByInitiator :exec
DELETE FROM server_applications WHERE initiated_by = @user_id;

-- name: ClearApplicationReviewsByReviewer :exec
UPDATE application_modification_requests SET reviewed_by = NULL WHERE reviewed_by = @user_id;

-- name: InsertAccountPurge :one
INSERT INTO account_purges (id, user_id) VALUES (@id, @user_id) RETURNING *;

-- name: GetAccountPurge :one
SELECT * FROM account_purges WHERE id = @id;

-- name: GetActiveAccountPurgeByUser :one
SELECT * FROM account_purges
WHERE user_id = @user_id AND status IN ('pending', 'running');

-- name: UpdateAccountPurgeProgress :exec
UPDATE account_purges
SET status = 'running', step = @step, logs_total = @logs_total, logs_deleted = @logs_deleted, updated_at = now()
WHERE id = @id;

-- name: FinishAccountPurge :exec
UPDATE account_purges
SET status = @status, error = @error, updated_at = now(), finished_at = now()
WHERE id = @id;
