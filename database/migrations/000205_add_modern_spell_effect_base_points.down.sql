BEGIN;

ALTER TABLE dbc_spells
    DROP COLUMN IF EXISTS effect_base_points_f;

COMMIT;
