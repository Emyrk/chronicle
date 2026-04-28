CREATE TABLE world_instance_script (
    map INTEGER PRIMARY KEY,
    parent INTEGER NOT NULL DEFAULT 0,
    script TEXT NOT NULL DEFAULT ''
);

CREATE TABLE world_boss_credit (
    entry INTEGER PRIMARY KEY,
    credit_type INTEGER NOT NULL DEFAULT 0,
    credit_entry INTEGER NOT NULL DEFAULT 0,
    last_encounter_dungeon INTEGER NOT NULL DEFAULT 0,
    comment TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_world_boss_credit_credit_entry ON world_boss_credit (credit_entry);