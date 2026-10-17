BEGIN;

DROP TABLE IF EXISTS private_log_access_requests;
DROP TABLE IF EXISTS private_log_share_links;
ALTER TABLE wow_log_groups DROP COLUMN IF EXISTS private;

COMMIT;
