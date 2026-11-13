BEGIN;
ALTER TABLE event_repair_operations
  DROP COLUMN applied_by,
  DROP COLUMN cancelled_by,
  DROP COLUMN apply_requested_at,
  DROP COLUMN cancelled_at;
COMMIT;
