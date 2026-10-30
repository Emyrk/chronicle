-- name: InsertAccountMergeRequest :one
INSERT INTO account_merge_requests (
  id, requester_user_id, source_user_id, target_user_id, discord_id,
  source_username, source_email, target_username, target_email, message
) VALUES (
  @id, @requester_user_id, @source_user_id, @target_user_id, @discord_id,
  @source_username, @source_email, @target_username, @target_email, @message
)
RETURNING *;

-- name: GetPendingAccountMergeRequestByTarget :one
SELECT * FROM account_merge_requests
WHERE target_user_id = @target_user_id AND status = 'pending';

-- name: ListMyAccountMergeRequests :many
SELECT * FROM account_merge_requests
WHERE requester_user_id = @requester_user_id
ORDER BY created_at DESC
LIMIT 100;

-- name: ListAdminAccountMergeRequests :many
SELECT * FROM account_merge_requests
ORDER BY (status = 'pending') DESC, created_at DESC
LIMIT 200;

-- name: LockPendingAccountMergeRequest :one
SELECT * FROM account_merge_requests
WHERE id = @id AND status = 'pending'
FOR UPDATE;

-- name: LockUsersForAccountMerge :many
SELECT id FROM users
WHERE id = ANY(@ids::uuid[])
ORDER BY id
FOR UPDATE;

-- name: ListUserAuthLinks :many
SELECT * FROM user_auth_links
WHERE user_id = @user_id
ORDER BY provider, id;

-- name: GetAccountRemovalBlockers :one
SELECT ARRAY_REMOVE(ARRAY[
  CASE WHEN EXISTS (SELECT 1 FROM wow_log_groups WHERE wow_log_groups.owner = @user_id) THEN 'uploaded logs' END,
  CASE WHEN EXISTS (SELECT 1 FROM log_file WHERE log_file.owner = @user_id) THEN 'uploaded files' END,
  CASE WHEN EXISTS (SELECT 1 FROM billing_subscriptions t WHERE t.user_id = @user_id) THEN 'billing subscription' END,
  CASE WHEN EXISTS (SELECT 1 FROM billing_entitlements t WHERE t.user_id = @user_id) THEN 'billing entitlements' END,
  CASE WHEN EXISTS (SELECT 1 FROM data_grants t WHERE t.user_id = @user_id AND t.source <> 'base') THEN 'storage grants' END,
  CASE WHEN EXISTS (SELECT 1 FROM guild_join_requests t WHERE t.user_id = @user_id) THEN 'guild join requests' END,
  CASE WHEN EXISTS (SELECT 1 FROM guild_discord_installations t WHERE t.installed_by = @user_id) THEN 'guild Discord installations' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_character_links t WHERE t.user_id = @user_id OR t.linked_by = @user_id) THEN 'linked characters' END,
  CASE WHEN EXISTS (SELECT 1 FROM gear_lists t WHERE t.user_id = @user_id) THEN 'gear lists' END,
  CASE WHEN EXISTS (SELECT 1 FROM gear_progressions t WHERE t.user_id = @user_id) THEN 'gear progressions' END,
  CASE WHEN EXISTS (SELECT 1 FROM gear_stat_weights t WHERE t.user_id = @user_id) THEN 'stat weights' END,
  CASE WHEN EXISTS (SELECT 1 FROM raid_compositions t WHERE t.user_id = @user_id) THEN 'raid compositions' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_talent_builds t WHERE t.user_id = @user_id) THEN 'talent builds' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_panel_layouts t WHERE t.user_id = @user_id) THEN 'panel layouts' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_tracked_layouts t WHERE t.user_id = @user_id) THEN 'tracked layouts' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_action_bar_slots t WHERE t.user_id = @user_id) THEN 'action bar settings' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_custom_panel_settings t WHERE t.user_id = @user_id) THEN 'custom panel settings' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_custom_panel_installations t WHERE t.user_id = @user_id) THEN 'custom panel installations' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_favorite_guilds t WHERE t.user_id = @user_id) THEN 'favorite guilds' END,
  CASE WHEN EXISTS (SELECT 1 FROM user_favorite_players t WHERE t.user_id = @user_id) THEN 'favorite players' END,
  CASE WHEN EXISTS (SELECT 1 FROM inference_connections t WHERE t.user_id = @user_id) THEN 'AI provider connections' END,
  CASE WHEN EXISTS (SELECT 1 FROM inference_threads t WHERE t.user_id = @user_id) THEN 'AI chat history' END,
  CASE WHEN EXISTS (SELECT 1 FROM inference_user_config t WHERE t.user_id = @user_id) THEN 'AI settings' END,
  CASE WHEN EXISTS (SELECT 1 FROM sidekick_installations t WHERE t.user_id = @user_id) THEN 'Sidekick installations' END,
  CASE WHEN EXISTS (SELECT 1 FROM sidekick_account_configs t WHERE t.user_id = @user_id) THEN 'Sidekick settings' END,
  CASE WHEN EXISTS (SELECT 1 FROM lua_projects t WHERE t.owner_id = @user_id) THEN 'published modules' END,
  CASE WHEN EXISTS (SELECT 1 FROM addon_authors t WHERE t.user_id = @user_id) THEN 'module author profile' END,
  CASE WHEN EXISTS (SELECT 1 FROM lua_project_contributors t WHERE t.user_id = @user_id OR t.added_by = @user_id) THEN 'module contributions' END,
  CASE WHEN EXISTS (SELECT 1 FROM lua_project_stars t WHERE t.user_id = @user_id) THEN 'starred modules' END,
  CASE WHEN EXISTS (SELECT 1 FROM proof_requests t WHERE t.applicant_id = @user_id OR t.reviewer_id = @user_id) THEN 'proof request history' END,
  CASE WHEN EXISTS (SELECT 1 FROM server_applications t WHERE t.initiated_by = @user_id) THEN 'server applications' END,
  CASE WHEN EXISTS (SELECT 1 FROM application_modification_requests t WHERE t.reviewed_by = @user_id) THEN 'application reviews' END,
  CASE WHEN EXISTS (SELECT 1 FROM shared_views t WHERE t.created_by = @user_id) THEN 'shared views' END,
  CASE WHEN EXISTS (SELECT 1 FROM wow_servers t WHERE t.created_by = @user_id) THEN 'created servers' END,
  CASE WHEN EXISTS (SELECT 1 FROM wow_server_realms t WHERE t.created_by = @user_id) THEN 'created realms' END,
  CASE WHEN EXISTS (SELECT 1 FROM wow_server_upload_keys t WHERE t.created_by = @user_id) THEN 'server upload keys' END
], NULL)::text[] AS blockers;

-- name: HasPendingAccountMergeRequestForUser :one
SELECT EXISTS (
  SELECT 1 FROM account_merge_requests
  WHERE status = 'pending' AND (source_user_id = @user_id OR target_user_id = @user_id)
);

-- name: MoveUserAuthLink :exec
UPDATE user_auth_links
SET user_id = @target_user_id, updated_at = now()
WHERE id = @auth_link_id AND user_id = @source_user_id;

-- name: DeleteUserAuthSessionsByUserID :exec
DELETE FROM user_auth_session WHERE user_id = @user_id;

-- name: DeleteUserAuthLinksByUserID :exec
DELETE FROM user_auth_links WHERE user_id = @user_id;

-- name: DeleteUserAccountRow :execrows
DELETE FROM users WHERE id = @user_id;

-- name: DecideAccountMergeRequest :execrows
UPDATE account_merge_requests
SET status = @status, response = @response, reviewer_id = @reviewer_id, reviewed_at = now()
WHERE id = @id AND status = 'pending';
