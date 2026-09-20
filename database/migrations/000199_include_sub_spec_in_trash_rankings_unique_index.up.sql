BEGIN;

-- A player can change between ranking sub-specs without changing their broader
-- spec (for example, Feral Cat and Bear). Preserve one trash aggregate for each
-- sub-spec instead of rejecting the second row and rolling back all rankings for
-- the instance.
DROP INDEX IF EXISTS idx_edr_trash_unique;
CREATE UNIQUE INDEX idx_edr_trash_unique
    ON encounter_dps_rankings (instance_id, player_guid, player_spec, player_sub_spec)
    WHERE encounter_id IS NULL;

COMMIT;
