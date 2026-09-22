BEGIN;

ALTER TABLE dbc_spells
    ADD COLUMN effect_base_points_f REAL[] NOT NULL DEFAULT '{}';

COMMIT;
