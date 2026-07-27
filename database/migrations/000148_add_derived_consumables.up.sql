BEGIN;

-- Consumable items and their applied buffs, derived from dataset-scoped item
-- templates and spells whenever either source is uploaded.
CREATE TABLE dbc_consumables (
    dataset_id     UUID  NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    item_id        INT   NOT NULL,
    item_name      TEXT  NOT NULL,
    item_quality   INT   NOT NULL DEFAULT 0,
    item_icon      TEXT  NOT NULL DEFAULT '',
    item_spell_ids INT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (dataset_id, item_id)
);

CREATE TABLE dbc_consumable_buffs (
    dataset_id UUID NOT NULL,
    item_id    INT  NOT NULL,
    spell_id   INT  NOT NULL,
    spell_name TEXT NOT NULL,
    PRIMARY KEY (dataset_id, item_id, spell_id),
    FOREIGN KEY (dataset_id, item_id)
        REFERENCES dbc_consumables(dataset_id, item_id)
        ON DELETE CASCADE
);

CREATE INDEX dbc_consumable_buffs_spell_idx
    ON dbc_consumable_buffs(dataset_id, spell_id);

COMMIT;
