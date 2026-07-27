BEGIN;

-- Spells whose aura durations can be changed by passive duration modifiers.
-- Rebuilt from dataset-scoped spells, spell durations, and duration modifiers
-- whenever either source DBC is uploaded.
CREATE TABLE dbc_affected_aura_durations (
    dataset_id       UUID    NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    spell_id         INT     NOT NULL,
    spell_name       TEXT    NOT NULL,
    spell_class_set  INT     NOT NULL,
    base_duration_ms INT     NOT NULL,
    max_duration_ms  BIGINT  NOT NULL,
    deprecated       BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (dataset_id, spell_id)
);

CREATE TABLE dbc_affected_aura_duration_modifiers (
    dataset_id        UUID NOT NULL,
    spell_id          INT  NOT NULL,
    modifier_spell_id INT  NOT NULL,
    PRIMARY KEY (dataset_id, spell_id, modifier_spell_id),
    FOREIGN KEY (dataset_id, spell_id)
        REFERENCES dbc_affected_aura_durations(dataset_id, spell_id)
        ON DELETE CASCADE,
    FOREIGN KEY (dataset_id, modifier_spell_id)
        REFERENCES dbc_duration_modifiers(dataset_id, spell_id)
        ON DELETE CASCADE
);

CREATE INDEX dbc_affected_aura_duration_modifiers_modifier_idx
    ON dbc_affected_aura_duration_modifiers(dataset_id, modifier_spell_id);

COMMIT;
