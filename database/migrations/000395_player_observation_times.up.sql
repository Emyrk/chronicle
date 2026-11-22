BEGIN;

ALTER TABLE game_players
  ADD COLUMN name_observed_at timestamptz,
  ADD COLUMN class_observed_at timestamptz,
  ADD COLUMN race_observed_at timestamptz,
  ADD COLUMN gender_observed_at timestamptz,
  ADD COLUMN faction_observed_at timestamptz,
  ADD COLUMN level_observed_at timestamptz,
  ADD COLUMN guild_observed_at timestamptz,
  ADD COLUMN scouting_last_seen_at timestamptz;

COMMIT;
