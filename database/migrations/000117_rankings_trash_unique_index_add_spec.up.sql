-- The original partial unique index only had (instance_id, player_guid) for trash rows.
-- A player who respecs mid-raid needs separate trash rows per spec.
DROP INDEX IF EXISTS idx_edr_trash_unique;
CREATE UNIQUE INDEX idx_edr_trash_unique ON encounter_dps_rankings (instance_id, player_guid, player_spec)
    WHERE encounter_id IS NULL;
