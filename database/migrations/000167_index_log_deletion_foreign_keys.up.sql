BEGIN;

-- These indexes support the foreign-key cascades and SET NULL actions triggered
-- when deleting log groups, parsed log groups, and individual log instances.
-- Production operators may pre-create the same indexes concurrently; the
-- IF NOT EXISTS clauses make this migration a no-op for those indexes.
CREATE INDEX IF NOT EXISTS idx_log_file_wow_log_id
    ON log_file (wow_log_id);

CREATE INDEX IF NOT EXISTS idx_parse_score_results_log_group_id
    ON parse_score_results (log_group_id)
    WHERE log_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_log_instance_events_instance_id
    ON log_instance_events (instance_id);

CREATE INDEX IF NOT EXISTS idx_game_player_gear_history_instance_id
    ON game_player_gear_history (instance_id);

CREATE INDEX IF NOT EXISTS idx_game_players_updated_from_instance
    ON game_players (updated_from_instance)
    WHERE updated_from_instance IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parse_score_results_instance_id
    ON parse_score_results (instance_id);

CREATE INDEX IF NOT EXISTS idx_encounter_dps_rankings_instance_id
    ON encounter_dps_rankings (instance_id);

COMMIT;
