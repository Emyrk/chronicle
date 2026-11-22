BEGIN;
ALTER TABLE log_instance_players DROP CONSTRAINT log_instance_players_realm_id_fkey;
ALTER TABLE log_instance_players DROP COLUMN realm_id;
COMMIT;
