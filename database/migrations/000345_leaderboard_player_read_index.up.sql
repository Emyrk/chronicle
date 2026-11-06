BEGIN;

-- Exact performance cohorts are read independently. The catalog primary key
-- starts with encounter_name; a multi-boss read otherwise scans other cohorts.
-- Cover raw bands so warm, vacuumed summaries can use an index-only scan.
-- This index builds over the new summary table, never historical observations.
CREATE INDEX leaderboard_player_boss_read_idx ON leaderboard_player_boss_subjects
    (tenant_id, instance_name, difficulty_name, max_players,
     player_class, player_spec, player_sub_spec, metric,
     realm_id, player_guid, encounter_name)
    INCLUDE (raw_peak, raw_form, raw_floor, observation_count, computed_at);

COMMIT;
