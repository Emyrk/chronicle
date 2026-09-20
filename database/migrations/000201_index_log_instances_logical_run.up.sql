BEGIN;

CREATE INDEX idx_log_instances_logical_run
    ON log_instances ((COALESCE(duplicate_group_id, id)));

COMMIT;
