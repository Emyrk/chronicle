BEGIN;

-- Peak is a parse score; keep the throughput behind it so boards can show the
-- DPS/HPS beside it and break tied scores by it. 0 means unknown (and is the
-- value for non-Peak rows). A constant default is metadata-only in Postgres, and
-- these tables are empty in production; the next rating rebuild fills them.

-- The kill's length, so a raid Peak can weigh each boss by fight duration.
ALTER TABLE rating_stage_player_observations ADD COLUMN duration_secs double precision NOT NULL DEFAULT 0;

-- The best kill's length behind a boss Peak (best_raw already holds its DPS/HPS).
ALTER TABLE player_tenant_rating_boss_scores ADD COLUMN best_duration_secs double precision NOT NULL DEFAULT 0;

-- A raid Peak's throughput over the bosses it counts: total output over total
-- fight time, i.e. sum(best_raw * best_duration_secs) / sum(best_duration_secs).
ALTER TABLE player_tenant_rating_scope_scores ADD COLUMN best_raw double precision NOT NULL DEFAULT 0;
ALTER TABLE player_tenant_rating_scope_scores ADD COLUMN best_duration_secs double precision NOT NULL DEFAULT 0;

COMMIT;
