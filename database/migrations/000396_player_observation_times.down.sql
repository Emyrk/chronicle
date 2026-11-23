BEGIN;

ALTER TABLE game_players
  DROP COLUMN name_observed_at,
  DROP COLUMN class_observed_at,
  DROP COLUMN race_observed_at,
  DROP COLUMN gender_observed_at,
  DROP COLUMN faction_observed_at,
  DROP COLUMN level_observed_at,
  DROP COLUMN guild_observed_at,
  DROP COLUMN scouting_last_seen_at;

COMMIT;
