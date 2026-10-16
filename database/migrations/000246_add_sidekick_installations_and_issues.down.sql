BEGIN;

DROP TABLE IF EXISTS sidekick_issues;
DROP TABLE IF EXISTS sidekick_wow_directories;
DROP TABLE IF EXISTS sidekick_oauth_grants;
DROP TABLE IF EXISTS sidekick_installations;

ALTER TABLE oauth_device_sessions
  DROP COLUMN IF EXISTS sidekick_installation_version,
  DROP COLUMN IF EXISTS sidekick_installation_platform,
  DROP COLUMN IF EXISTS sidekick_installation_name,
  DROP COLUMN IF EXISTS sidekick_installation_id;

COMMIT;
