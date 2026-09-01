BEGIN;

ALTER TABLE ranking_snapshots DROP COLUMN member_count;

COMMIT;
