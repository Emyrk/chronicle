CREATE TYPE wow_player_faction AS ENUM ('Alliance', 'Horde');

ALTER TABLE game_players
  ADD COLUMN faction wow_player_faction;

ALTER TABLE log_instance_players
  ADD COLUMN faction wow_player_faction;
