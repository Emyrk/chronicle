BEGIN;

ALTER TABLE guild_discord_install_states
  ADD COLUMN tenant_slug TEXT;

COMMIT;
