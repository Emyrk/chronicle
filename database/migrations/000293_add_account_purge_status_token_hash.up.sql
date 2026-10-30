BEGIN;
-- Existing jobs keep running. Legacy rows have no anonymous status capability.
ALTER TABLE account_purges ADD COLUMN status_token_hash bytea;
COMMIT;
