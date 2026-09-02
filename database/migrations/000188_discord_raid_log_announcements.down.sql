BEGIN;

DROP TABLE IF EXISTS guild_discord_log_announcement_sources;
DROP TABLE IF EXISTS guild_discord_log_announcements;
ALTER TABLE log_instances DROP COLUMN IF EXISTS category;

COMMIT;
