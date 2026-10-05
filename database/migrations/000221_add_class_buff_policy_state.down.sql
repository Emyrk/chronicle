BEGIN;

ALTER TABLE class_buff_ignores
    DROP COLUMN ignored;

COMMIT;
