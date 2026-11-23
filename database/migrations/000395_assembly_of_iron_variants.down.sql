BEGIN;
SET LOCAL lock_timeout = '5s';
-- Keep the widened key domain on rollback. Narrowing would require scanning
-- populated tables or deleting valid Medium history. Older binaries can ignore
-- the exact cohorts while Combined history remains intact.
COMMIT;
