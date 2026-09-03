BEGIN;

ALTER TABLE guild_discord_log_announcements
  ADD COLUMN delivery_error TEXT;

COMMIT;
