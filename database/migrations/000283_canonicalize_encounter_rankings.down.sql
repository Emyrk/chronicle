BEGIN;

DROP INDEX IF EXISTS idx_edr_boss_canonical_unique;

-- Deleted noncanonical encounter rows cannot be restored by the down migration.

COMMIT;
