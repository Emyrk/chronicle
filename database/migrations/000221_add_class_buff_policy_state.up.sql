BEGIN;

ALTER TABLE class_buff_ignores
    ADD COLUMN ignored BOOLEAN NOT NULL DEFAULT true;

COMMIT;
