BEGIN;

DROP TABLE ranking_runs;

ALTER TABLE log_instances
DROP COLUMN updated_at;

COMMIT;
