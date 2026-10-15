BEGIN;

-- Migration 000237 permanently deletes ranking snapshot headers and member
-- populations. Those immutable cohort rows cannot be reconstructed from the
-- surviving receipt/result provenance, so recreating empty tables would not be
-- a valid rollback. Restore a database backup taken before applying 000237.
DO $$
BEGIN
    RAISE EXCEPTION
        'migration 000237 is irreversible: restore a database backup taken before the legacy ranking snapshots were dropped';
END
$$;

COMMIT;
