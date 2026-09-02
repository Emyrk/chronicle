BEGIN;

DROP INDEX guild_discord_installations_discord_guild_id_idx;

ALTER TABLE guild_discord_installations
  ADD CONSTRAINT guild_discord_installations_discord_guild_id_key
  UNIQUE (discord_guild_id);

COMMIT;
