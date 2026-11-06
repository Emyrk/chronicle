-- Irreversible: dropping rating/ranking/parse-scoring data has no safe rollback.
-- Restore from a predeploy backup if rollback is required.
DO $$ BEGIN
    RAISE EXCEPTION 'rating/ranking/parse-scoring retirement cannot be rolled back; restore from a predeploy backup';
END $$;
