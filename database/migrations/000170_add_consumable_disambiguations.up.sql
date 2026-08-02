BEGIN;

CREATE TABLE dataset_consumable_disambiguations (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    effect_kind TEXT NOT NULL CHECK (effect_kind IN ('buff', 'direct')),
    spell_id INT NOT NULL,
    item_id INT,
    ignored BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, effect_kind, spell_id),
    CHECK ((ignored AND item_id IS NULL) OR (NOT ignored AND item_id IS NOT NULL))
);

COMMIT;
