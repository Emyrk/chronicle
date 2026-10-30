BEGIN;

ALTER TABLE log_file_parts
ADD COLUMN counts_toward_user_limit boolean NOT NULL DEFAULT false;

COMMIT;
