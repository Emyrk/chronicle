BEGIN;

DROP INDEX IF EXISTS idx_parse_score_receipts_window_contract;
DROP INDEX IF EXISTS idx_parse_score_receipts_legacy_contract;
DELETE FROM parse_score_receipts WHERE snapshot_id IS NULL;
ALTER TABLE parse_score_receipts
    DROP COLUMN IF EXISTS cohort_mode,
    DROP COLUMN IF EXISTS window_start,
    DROP COLUMN IF EXISTS cutoff;
ALTER TABLE parse_score_receipts ALTER COLUMN snapshot_id SET NOT NULL;
ALTER TABLE parse_score_receipts
    ADD CONSTRAINT parse_score_receipts_tenant_id_instance_id_snapshot_id_look_key
    UNIQUE (tenant_id, instance_id, snapshot_id, lookback_days, policy_version, query_version);

DROP TABLE IF EXISTS parse_score_memberships;

COMMIT;
