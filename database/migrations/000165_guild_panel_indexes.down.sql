BEGIN;

DROP INDEX IF EXISTS idx_log_instances_guild;
DROP INDEX IF EXISTS idx_game_players_guild;
DROP INDEX IF EXISTS idx_psr_guild;

COMMIT;
