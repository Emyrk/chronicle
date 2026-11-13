BEGIN;
ALTER TABLE event_repair_operations
  ADD COLUMN applied_by uuid,
  ADD COLUMN cancelled_by uuid,
  ADD COLUMN apply_requested_at timestamptz,
  ADD COLUMN cancelled_at timestamptz;
COMMIT;
