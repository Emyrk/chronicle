BEGIN;

ALTER TABLE encounter_dps_rankings
    ADD COLUMN player_deaths INTEGER,
    ADD COLUMN alive_percentage DOUBLE PRECISION;

COMMIT;
