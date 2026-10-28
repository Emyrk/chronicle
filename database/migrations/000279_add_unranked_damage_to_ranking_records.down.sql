BEGIN;

ALTER TABLE encounter_dps_rankings DROP COLUMN unranked_damage_done;

COMMIT;
