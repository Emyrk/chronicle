BEGIN;

ALTER TABLE dbc_spell_effects
    DROP COLUMN effect_dice_per_level,
    DROP COLUMN effect_base_dice,
    DROP COLUMN effect_die_sides;

COMMIT;
