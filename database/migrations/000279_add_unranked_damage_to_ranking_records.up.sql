BEGIN;

-- Constant defaults are metadata-only in PostgreSQL 17; historical rows stay at zero.
ALTER TABLE encounter_dps_rankings
  ADD COLUMN unranked_damage_done BIGINT NOT NULL DEFAULT 0;

COMMIT;
