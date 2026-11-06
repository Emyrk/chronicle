-- Irreversible: dropping rating data has no safe rollback.
-- Restore from a predeploy backup if rollback is required.
DO $$ BEGIN
    RAISE EXCEPTION 'rating retirement cannot be rolled back; restore from a predeploy backup';
END $$;
