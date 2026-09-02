BEGIN;

ALTER TABLE guild_discord_installations
  DROP COLUMN announce_raid_logs_channel_id,
  DROP COLUMN announce_raid_logs_scope,
  DROP COLUMN announce_raid_logs;

COMMIT;
