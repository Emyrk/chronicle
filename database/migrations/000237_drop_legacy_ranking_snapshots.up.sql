BEGIN;

-- Legacy snapshot-backed receipts are the durable contract for already-scored
-- parses. Preserve the exact cohort metadata they used before removing the
-- source tables. Window-based receipts already carry these values.
UPDATE parse_score_receipts receipt
SET cutoff = snapshot.cutoff,
    window_start = snapshot.window_start,
    cohort_mode = snapshot.cohort_mode
FROM ranking_snapshots snapshot
WHERE receipt.snapshot_id = snapshot.id;

ALTER TABLE parse_score_receipts
    ALTER COLUMN cutoff SET NOT NULL,
    ALTER COLUMN cohort_mode SET NOT NULL;

-- snapshot_id remains nullable opaque provenance on both tables. Results and
-- receipts must survive independently of the retired snapshot publication data.
ALTER TABLE parse_score_receipts
    DROP CONSTRAINT parse_score_receipts_snapshot_id_fkey;
ALTER TABLE parse_score_results
    DROP CONSTRAINT parse_score_results_snapshot_id_fkey;

DROP TABLE ranking_snapshot_members;
DROP TABLE ranking_snapshots;

COMMIT;
