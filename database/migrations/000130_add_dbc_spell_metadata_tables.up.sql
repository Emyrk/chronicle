-- Per-dataset spell metadata lookup tables.
-- These store the resolved data from companion DBC files
-- (SpellCastTimes.dbc, SpellDuration.dbc, etc.) so spell queries
-- can LEFT JOIN and return fully resolved metadata without
-- relying on compiled-in global maps.

CREATE TABLE dbc_spell_cast_times (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id         INT  NOT NULL,
    base       INT  NOT NULL DEFAULT 0,
    per_level  INT  NOT NULL DEFAULT 0,
    minimum    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (dataset_id, id)
);

CREATE TABLE dbc_spell_durations (
    dataset_id         UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id                 INT  NOT NULL,
    duration           INT  NOT NULL DEFAULT 0,
    duration_per_level INT  NOT NULL DEFAULT 0,
    max_duration       INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (dataset_id, id)
);

CREATE TABLE dbc_spell_ranges (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id         INT  NOT NULL,
    range_min  REAL NOT NULL DEFAULT 0,
    range_max  REAL NOT NULL DEFAULT 0,
    flags      INT  NOT NULL DEFAULT 0,
    name       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (dataset_id, id)
);

CREATE TABLE dbc_spell_icons (
    dataset_id       UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id               INT  NOT NULL,
    texture_filename TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (dataset_id, id)
);

CREATE TABLE dbc_spell_categories (
    dataset_id           UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id                   INT  NOT NULL,
    flags                INT  NOT NULL DEFAULT 0,
    uses_per_week        INT  NOT NULL DEFAULT 0,
    name                 TEXT NOT NULL DEFAULT '',
    max_charges          INT  NOT NULL DEFAULT 0,
    charge_recovery_time INT  NOT NULL DEFAULT 0,
    type_mask            INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (dataset_id, id)
);

CREATE TABLE dbc_spell_radii (
    dataset_id       UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id               INT  NOT NULL,
    radius           REAL NOT NULL DEFAULT 0,
    radius_per_level REAL NOT NULL DEFAULT 0,
    radius_min       REAL NOT NULL DEFAULT 0,
    radius_max       REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (dataset_id, id)
);

CREATE TABLE dbc_spell_focus_objects (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    id         INT  NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (dataset_id, id)
);

-- Derived data tables.
-- Populated server-side at spell import time by analyzing the imported
-- spell effects. Used by the parser hot path.

CREATE TABLE dbc_extra_attack_spells (
    dataset_id        UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    spell_id          INT  NOT NULL,
    name              TEXT NOT NULL,
    num_extra_attacks INT  NOT NULL,
    PRIMARY KEY (dataset_id, spell_id)
);

CREATE TABLE dbc_duration_modifiers (
    dataset_id       UUID    NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    spell_id         INT     NOT NULL,
    name             TEXT    NOT NULL,
    percent          INT     NOT NULL DEFAULT 0,
    flat             INT     NOT NULL DEFAULT 0,
    deprecated       BOOLEAN NOT NULL DEFAULT false,
    spell_class_set  INT     NOT NULL,
    spell_class_mask BIGINT  NOT NULL,
    PRIMARY KEY (dataset_id, spell_id)
);

CREATE TABLE dbc_periodic_spells (
    dataset_id UUID    NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    spell_id   INT     NOT NULL,
    name       TEXT    NOT NULL,
    has_direct BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (dataset_id, spell_id)
);
