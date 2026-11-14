-- Dataset revisions are a monotonic publication fence. Dropping the column or
-- sequence would allow a recreated dataset to reuse an old revision and make a
-- stale parser publication appear current. This migration is intentionally
-- irreversible; restoring an older application version requires preserving the
-- revision column and sequence.
DO $$
BEGIN
    RAISE EXCEPTION 'migration 000386 is irreversible: dataset revision history must be preserved';
END
$$;
