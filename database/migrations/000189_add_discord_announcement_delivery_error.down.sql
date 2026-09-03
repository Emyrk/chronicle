BEGIN;

ALTER TABLE guild_discord_log_announcements
  DROP COLUMN IF EXISTS delivery_error;

COMMIT;
