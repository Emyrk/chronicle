BEGIN;

ALTER TABLE dbc_cooldown_spells
    DROP COLUMN duration_ms;

COMMIT;
