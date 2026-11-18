BEGIN;
SET LOCAL lock_timeout = '5s';
-- Nullable, no default: metadata-only, with no historical rewrite or backfill.
-- This payload is display-only and must never become a ranking dimension.
ALTER TABLE log_instance_encounters ADD COLUMN encounter_variant_tooltip_data jsonb;
COMMIT;
