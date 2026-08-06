BEGIN;

DROP INDEX IF EXISTS idx_encounter_dps_rankings_instance_id;
DROP INDEX IF EXISTS idx_parse_score_results_instance_id;
DROP INDEX IF EXISTS idx_game_players_updated_from_instance;
DROP INDEX IF EXISTS idx_game_player_gear_history_instance_id;
DROP INDEX IF EXISTS idx_log_instance_events_instance_id;
DROP INDEX IF EXISTS idx_parse_score_results_log_group_id;
DROP INDEX IF EXISTS idx_log_file_wow_log_id;

COMMIT;
