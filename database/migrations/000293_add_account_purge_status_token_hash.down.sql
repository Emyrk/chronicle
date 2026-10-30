BEGIN;
ALTER TABLE account_purges DROP COLUMN status_token_hash;
COMMIT;
