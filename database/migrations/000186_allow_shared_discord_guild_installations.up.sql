BEGIN;

ALTER TABLE guild_discord_installations
  DROP CONSTRAINT guild_discord_installations_discord_guild_id_key;

CREATE INDEX guild_discord_installations_discord_guild_id_idx
  ON guild_discord_installations (discord_guild_id);

COMMIT;
