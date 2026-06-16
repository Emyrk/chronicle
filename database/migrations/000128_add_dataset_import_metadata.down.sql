BEGIN;

ALTER TABLE datasets
    DROP COLUMN spells_imported_at,
    DROP COLUMN spells_count;

END;
