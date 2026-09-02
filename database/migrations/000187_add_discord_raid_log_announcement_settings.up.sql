BEGIN;

ALTER TABLE guild_discord_installations
  ADD COLUMN announce_raid_logs BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN announce_raid_logs_scope TEXT NOT NULL DEFAULT 'raids_only'
    CHECK (announce_raid_logs_scope IN ('raids_only', 'dungeons_only', 'all')),
  ADD COLUMN announce_raid_logs_channel_id TEXT;

COMMIT;
