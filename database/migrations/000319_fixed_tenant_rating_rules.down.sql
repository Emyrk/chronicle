-- The old tenant configuration rows are deliberately not retained. Reversing
-- this migration would silently restore a writer that cannot publish without
-- those rows; roll back the application with a forward repair instead.
DO $$ BEGIN RAISE EXCEPTION 'fixed tenant rating rules migration is irreversible'; END $$;
