BEGIN;

ALTER TABLE log_file_parts
DROP COLUMN counts_toward_user_limit;

COMMIT;
