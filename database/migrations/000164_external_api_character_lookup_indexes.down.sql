BEGIN;

DROP INDEX IF EXISTS idx_game_players_realm_lower_name;
DROP INDEX IF EXISTS idx_log_instance_players_unit_guid_instance;

COMMIT;
