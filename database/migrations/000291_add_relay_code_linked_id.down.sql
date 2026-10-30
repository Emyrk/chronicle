BEGIN;

ALTER TABLE oauth_relay_codes DROP COLUMN IF EXISTS linked_id;

COMMIT;
