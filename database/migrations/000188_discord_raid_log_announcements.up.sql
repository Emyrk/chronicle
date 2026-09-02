BEGIN;

ALTER TABLE log_instances
  ADD COLUMN category TEXT CHECK (category IN ('raid', 'dungeon'));

CREATE TABLE guild_discord_log_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  discord_channel_id TEXT NOT NULL,
  discord_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, run_id)
);

CREATE TABLE guild_discord_log_announcement_sources (
  announcement_id UUID NOT NULL REFERENCES guild_discord_log_announcements(id) ON DELETE CASCADE,
  log_group_id UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE,
  instance_ordinal INTEGER NOT NULL CHECK (instance_ordinal >= 0),
  instance_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (log_group_id, instance_ordinal)
);

CREATE UNIQUE INDEX guild_discord_log_announcement_sources_slug_idx
  ON guild_discord_log_announcement_sources (instance_slug)
  WHERE instance_slug IS NOT NULL;

CREATE INDEX guild_discord_log_announcement_sources_announcement_id_idx
  ON guild_discord_log_announcement_sources (announcement_id);

COMMIT;
