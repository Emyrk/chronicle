BEGIN;

ALTER TABLE encounter_dps_rankings
    DROP COLUMN alive_percentage,
    DROP COLUMN player_deaths;

COMMIT;
