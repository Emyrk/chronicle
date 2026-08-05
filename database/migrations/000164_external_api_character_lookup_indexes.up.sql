BEGIN;

CREATE INDEX idx_log_instance_players_unit_guid_instance
ON log_instance_players (unit_guid, instance_id);

CREATE INDEX idx_game_players_realm_lower_name
ON game_players (realm_id, lower(name));

COMMIT;
