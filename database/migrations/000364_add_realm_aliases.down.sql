BEGIN;

DROP TRIGGER IF EXISTS wow_server_realms_names_unique ON wow_server_realms;
DROP FUNCTION IF EXISTS validate_wow_server_realm_names_unique();
ALTER TABLE wow_server_realms DROP COLUMN IF EXISTS aliases;

COMMIT;
