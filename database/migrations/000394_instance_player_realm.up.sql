BEGIN;

-- Nullable evidence only: do not backfill the instance realm assumption.
ALTER TABLE log_instance_players ADD COLUMN realm_id UUID;
-- Enforce future writes without scanning historical participant rows at startup.
ALTER TABLE log_instance_players
  ADD CONSTRAINT log_instance_players_realm_id_fkey
  FOREIGN KEY (realm_id) REFERENCES wow_server_realms(id) ON DELETE SET NULL NOT VALID;

COMMIT;
