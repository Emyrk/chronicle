CREATE TABLE dbc_cooldown_spells (
    dataset_id                UUID   NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    spell_id                  INT    NOT NULL,
    name                      TEXT   NOT NULL,
    name_subtext              TEXT   NOT NULL DEFAULT '',
    recovery_time_ms          BIGINT NOT NULL DEFAULT 0,
    category_recovery_time_ms BIGINT NOT NULL DEFAULT 0,
    spell_class_set           INT    NOT NULL,
    PRIMARY KEY (dataset_id, spell_id)
);

CREATE INDEX idx_dbc_cooldown_spells_class
    ON dbc_cooldown_spells (dataset_id, spell_class_set);
