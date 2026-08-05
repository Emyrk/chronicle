BEGIN;

ALTER TABLE game_player_gear_history
    ALTER CONSTRAINT game_player_gear_history_instance_id_fkey
    NOT DEFERRABLE INITIALLY IMMEDIATE;

COMMIT;
