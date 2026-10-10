BEGIN;

ALTER TABLE dbc_cooldown_spells
    ADD COLUMN duration_ms BIGINT;

COMMIT;
