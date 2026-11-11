ALTER TABLE log_instance_players
  DROP COLUMN faction;

ALTER TABLE game_players
  DROP COLUMN faction;

DROP TYPE wow_player_faction;
