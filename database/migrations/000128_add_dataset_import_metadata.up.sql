BEGIN;

ALTER TABLE datasets
    ADD COLUMN spells_imported_at  TIMESTAMPTZ,
    ADD COLUMN spells_count        INT NOT NULL DEFAULT 0;

END;
