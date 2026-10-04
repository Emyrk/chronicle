BEGIN;

-- Generalize cooldown ignores into per-spell overrides. Existing rows were
-- ignores, so they keep ignored = TRUE.
ALTER TABLE dataset_cooldown_ignores RENAME TO dataset_cooldown_overrides;
ALTER TABLE dataset_cooldown_overrides RENAME CONSTRAINT dataset_cooldown_ignores_pkey TO dataset_cooldown_overrides_pkey;
ALTER TABLE dataset_cooldown_overrides RENAME CONSTRAINT dataset_cooldown_ignores_dataset_id_fkey TO dataset_cooldown_overrides_dataset_id_fkey;
ALTER TABLE dataset_cooldown_overrides ADD COLUMN ignored BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE dataset_cooldown_overrides ALTER COLUMN ignored SET DEFAULT FALSE;
-- Hide the spell-duration bar in the Cooldown Usage panel.
ALTER TABLE dataset_cooldown_overrides ADD COLUMN hide_duration BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
