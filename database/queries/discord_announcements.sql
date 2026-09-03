-- Discord raid-log announcements

-- name: GetDiscordAnnouncementSource :one
SELECT
  sqlc.embed(s),
  sqlc.embed(a)
FROM guild_discord_log_announcement_sources s
JOIN guild_discord_log_announcements a ON a.id = s.announcement_id
WHERE s.log_group_id = @log_group_id
  AND s.instance_ordinal = @instance_ordinal;

-- name: GetDiscordAnnouncementSourceBySlug :one
SELECT
  sqlc.embed(s),
  sqlc.embed(a)
FROM guild_discord_log_announcement_sources s
JOIN guild_discord_log_announcements a ON a.id = s.announcement_id
WHERE s.instance_slug = @instance_slug;

-- name: GetDiscordAnnouncementByRun :one
SELECT *
FROM guild_discord_log_announcements
WHERE guild_id = @guild_id AND run_id = @run_id;

-- name: UpsertDiscordAnnouncement :one
INSERT INTO guild_discord_log_announcements (
  guild_id, run_id, discord_channel_id
) VALUES (@guild_id, @run_id, @discord_channel_id)
ON CONFLICT (guild_id, run_id) DO UPDATE SET
  updated_at = NOW()
RETURNING *;

-- name: UpsertDiscordAnnouncementSource :one
INSERT INTO guild_discord_log_announcement_sources (
  announcement_id, log_group_id, instance_ordinal, instance_slug
) VALUES (
  @announcement_id, @log_group_id, @instance_ordinal, @instance_slug
)
ON CONFLICT (log_group_id, instance_ordinal) DO UPDATE SET
  announcement_id = EXCLUDED.announcement_id,
  instance_slug = EXCLUDED.instance_slug,
  updated_at = NOW()
RETURNING *;

-- name: DeleteDiscordAnnouncementSource :exec
DELETE FROM guild_discord_log_announcement_sources
WHERE log_group_id = @log_group_id AND instance_ordinal = @instance_ordinal;

-- name: MoveDiscordAnnouncementSources :exec
UPDATE guild_discord_log_announcement_sources
SET announcement_id = @to_announcement_id,
    updated_at = NOW()
WHERE announcement_id = @from_announcement_id;

-- name: UpdateDiscordAnnouncementRun :one
UPDATE guild_discord_log_announcements
SET run_id = @run_id,
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: ClaimDiscordAnnouncementDelivery :one
UPDATE guild_discord_log_announcements
SET delivery_attempted_at = NOW(),
    updated_at = NOW()
WHERE id = @id
  AND discord_message_id IS NULL
  AND delivery_attempted_at IS NULL
RETURNING *;

-- name: SetDiscordAnnouncementMessage :one
UPDATE guild_discord_log_announcements
SET discord_channel_id = @discord_channel_id,
    discord_message_id = @discord_message_id,
    delivery_error = NULL,
    updated_at = NOW()
WHERE id = @id
RETURNING *;

-- name: SetDiscordAnnouncementDeliveryError :exec
UPDATE guild_discord_log_announcements
SET delivery_error = @delivery_error,
    updated_at = NOW()
WHERE id = @id;

-- name: ListGuildDiscordAnnouncementAttempts :many
SELECT
  sqlc.embed(a),
  source.instance_slug
FROM guild_discord_log_announcements a
LEFT JOIN LATERAL (
  SELECT s.instance_slug
  FROM guild_discord_log_announcement_sources s
  WHERE s.announcement_id = a.id
  ORDER BY s.created_at ASC, s.log_group_id ASC, s.instance_ordinal ASC
  LIMIT 1
) source ON TRUE
WHERE a.guild_id = @guild_id
ORDER BY COALESCE(a.delivery_attempted_at, a.created_at) DESC, a.created_at DESC, a.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: DeleteDiscordAnnouncement :exec
DELETE FROM guild_discord_log_announcements WHERE id = @id;

-- name: GetDiscordAnnouncement :one
SELECT * FROM guild_discord_log_announcements WHERE id = @id;

-- name: ListDiscordAnnouncementSources :many
SELECT *
FROM guild_discord_log_announcement_sources
WHERE announcement_id = @announcement_id
ORDER BY created_at, log_group_id, instance_ordinal;

-- name: GetLogGroupInstanceIDByOrdinal :one
SELECT li.id
FROM log_instances li
WHERE li.log_group_id = @log_group_id
ORDER BY li.start_time ASC NULLS LAST, li.id ASC
LIMIT 1 OFFSET @instance_ordinal;

-- name: GetLogInstanceForDiscordAnnouncement :one
SELECT * FROM log_instances WHERE id = @id;

-- name: ListInstancesForDiscordAnnouncement :many
SELECT
  li.id,
  li.log_group_id,
  li.name,
  li.hashed_slug,
  li.start_time,
  li.end_time,
  li.recorder_name,
  li.max_players,
  li.difficulty_name,
  li.category,
  wlg.created_at AS uploaded_at,
  u.username AS uploader_name,
  wsr.name AS realm_name,
  g.name AS guild_name,
  t.slug AS tenant_slug,
  sr.duration_ms AS clear_duration_ms,
  COALESCE(guild_average.avg_duration_ms, 0)::bigint AS guild_avg_duration_ms,
  (SELECT COUNT(*) FROM log_instance_players lip WHERE lip.instance_id = li.id)::int AS player_count
FROM log_instances li
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
JOIN users u ON u.id = wlg.owner
LEFT JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN wow_servers ws ON ws.id = wsr.server_id
LEFT JOIN tenants t ON t.id = ws.tenant_id
LEFT JOIN guilds g ON g.id = li.guild_id
LEFT JOIN instance_speedruns sr ON sr.instance_id = li.id AND sr.qualified = TRUE AND sr.duration_ms > 0
LEFT JOIN LATERAL (
  SELECT AVG(previous.duration_ms)::bigint AS avg_duration_ms
  FROM (
    SELECT DISTINCT ON (COALESCE(previous_li.duplicate_group_id, previous_li.id))
      previous_sr.duration_ms
    FROM instance_speedruns previous_sr
    JOIN log_instances previous_li ON previous_li.id = previous_sr.instance_id
    WHERE previous_sr.guild_id = li.guild_id
      AND previous_sr.instance_name = li.name
      AND previous_li.difficulty_name = li.difficulty_name
      AND previous_li.max_players = li.max_players
      AND previous_sr.qualified = TRUE
      AND previous_sr.duration_ms > 0
      AND COALESCE(previous_li.duplicate_group_id, previous_li.id) != COALESCE(li.duplicate_group_id, li.id)
    ORDER BY COALESCE(previous_li.duplicate_group_id, previous_li.id), previous_sr.duration_ms ASC
  ) previous
) guild_average ON TRUE
WHERE COALESCE(li.duplicate_group_id, li.id) = @run_id::uuid
ORDER BY wlg.created_at ASC, li.start_time ASC NULLS LAST, li.id ASC;

-- name: ListDiscordAnnouncementEncounters :many
SELECT DISTINCT ON (lie.name)
  lie.name, lie.kill_type, lie.start_time, lie.end_time
FROM log_instance_encounters lie
WHERE lie.instance_id = @instance_id
  AND lie.boss = TRUE
ORDER BY
  lie.name,
  (lie.kill_type IN ('clean', 'partial')) DESC,
  lie.end_time DESC,
  lie.id DESC;
