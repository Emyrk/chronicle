BEGIN;

ALTER TABLE wow_log_groups
    DROP COLUMN format;

DROP TYPE log_format;

END;
