BEGIN;

-- Data-only migration. The inserted rows are canonical spell components and
-- may have been refreshed by a later importer run, so rolling back must not
-- delete them.

COMMIT;
