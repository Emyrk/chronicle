BEGIN;

CREATE INDEX IF NOT EXISTS idx_game_players_suggestions
    ON game_players (realm_id, lower(name) COLLATE "C", id);
CREATE INDEX IF NOT EXISTS idx_guilds_suggestions
    ON guilds (realm_id, lower(name) COLLATE "C", id);

COMMIT;
