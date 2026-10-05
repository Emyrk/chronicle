BEGIN;

-- Friendly class buffs are matched by spell name across datasets. Keeping the
-- ignore outside a dataset makes it apply to existing and future imports.
CREATE TABLE class_buff_ignores (
    normalized_name TEXT PRIMARY KEY,
    spell_name      TEXT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT class_buff_ignores_normalized_name_check
        CHECK (normalized_name = lower(btrim(spell_name)) AND normalized_name <> '')
);

COMMIT;
