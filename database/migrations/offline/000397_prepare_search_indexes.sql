-- MANUAL, only after scale review and operator approval. Run outside a transaction.
-- Failed INVALID indexes must be dropped concurrently before retrying.
CREATE INDEX CONCURRENTLY idx_game_players_suggestions ON game_players (realm_id, lower(name) COLLATE "C", id);
CREATE INDEX CONCURRENTLY idx_guilds_suggestions ON guilds (realm_id, lower(name) COLLATE "C", id);
