BEGIN;

ALTER TABLE guild_discord_install_states
  DROP COLUMN IF EXISTS tenant_slug;

COMMIT;
