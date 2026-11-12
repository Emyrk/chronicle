BEGIN;

-- Locale aliases collapse into one policy key. Recreating them cannot recover
-- their original identities, and would disconnect canonical encounter cohorts.
DO $$ BEGIN
    RAISE EXCEPTION 'migration 371 cannot be reversed losslessly; restore configuration from a pre-migration backup';
END $$;

COMMIT;
