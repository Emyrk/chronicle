BEGIN;
SET LOCAL lock_timeout = '2s';

-- Populated installations require approved concurrent preparation before startup.

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('idx_game_players_suggestions') AND indrelid = 'game_players'::regclass AND indisvalid AND indisready) THEN
        IF EXISTS (SELECT 1 FROM game_players LIMIT 1) THEN
            RAISE EXCEPTION 'migration 396 requires prebuilt valid index idx_game_players_suggestions; run approved offline/000396_prepare_search_indexes.sql before deployment';
        END IF;
        EXECUTE 'CREATE INDEX idx_game_players_suggestions ON game_players (realm_id, lower(name) COLLATE "C", id)';
    END IF;
END
$migration$;

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('idx_guilds_suggestions') AND indrelid = 'guilds'::regclass AND indisvalid AND indisready) THEN
        IF EXISTS (SELECT 1 FROM guilds LIMIT 1) THEN
            RAISE EXCEPTION 'migration 396 requires prebuilt valid index idx_guilds_suggestions; run approved offline/000396_prepare_search_indexes.sql before deployment';
        END IF;
        EXECUTE 'CREATE INDEX idx_guilds_suggestions ON guilds (realm_id, lower(name) COLLATE "C", id)';
    END IF;
END
$migration$;

COMMIT;
