DROP INDEX IF EXISTS idx_edr_trash_unique;
CREATE UNIQUE INDEX idx_edr_trash_unique ON encounter_dps_rankings (instance_id, player_guid)
    WHERE encounter_id IS NULL;
