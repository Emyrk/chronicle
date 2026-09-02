BEGIN;

CREATE TABLE guild_discord_install_states (
  state TEXT PRIMARY KEY,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX guild_discord_install_states_expires_at_idx
  ON guild_discord_install_states (expires_at);

CREATE TABLE guild_discord_installations (
  guild_id UUID PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  discord_guild_id TEXT NOT NULL UNIQUE,
  discord_guild_name TEXT NOT NULL,
  installed_by UUID NOT NULL REFERENCES users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
