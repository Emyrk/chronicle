BEGIN;

-- Cooldown spells hidden from the Cooldown Usage panel. Kept separate from
-- dbc_cooldown_spells so ignores survive Spell.dbc re-imports.
CREATE TABLE dataset_cooldown_ignores (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    spell_id INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, spell_id)
);

COMMIT;
