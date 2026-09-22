BEGIN;

ALTER TABLE dbc_spell_effects
    ADD COLUMN effect_die_sides INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN effect_base_dice INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN effect_dice_per_level INTEGER NOT NULL DEFAULT 0;

COMMIT;
