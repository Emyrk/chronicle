BEGIN;

ALTER TABLE dbc_spell_effects
    DROP COLUMN effect_die_sides,
    DROP COLUMN effect_base_points,
    DROP COLUMN effect_points_per_combo,
    DROP COLUMN effect_base_dice,
    DROP COLUMN effect_dice_per_level;

COMMIT;
