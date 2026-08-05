-- Per-character loot history lookups.
CREATE INDEX instance_loot_received ON instance_loot (realm_id, received_guid, received_ts DESC);

-- Per-character encounter aggregates (kills, first kills).
CREATE INDEX idx_edr_player_guid ON encounter_dps_rankings (player_guid);
