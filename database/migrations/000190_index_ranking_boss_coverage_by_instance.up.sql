BEGIN;

-- Representative-log selection counts distinct ranked boss names for every
-- instance. Keep those rows ordered and covered so the correlated count can use
-- a small index-only scan instead of visiting all ranking-table heap rows.
CREATE INDEX idx_edr_boss_coverage_by_instance
    ON encounter_dps_rankings (instance_id, encounter_name)
    WHERE encounter_id IS NOT NULL;

COMMIT;
