BEGIN;

-- Peak is a parse score; keep the throughput behind it so boards can show the
-- DPS/HPS beside it and break tied scores by it. Nullable adds with no default
-- are metadata-only: no table rewrite or scan at startup. Rows written before a
-- rebuild stay NULL until the next tenant rating generation.

-- The kill's length, so a raid Peak can weigh each boss by fight duration.
ALTER TABLE rating_stage_player_observations ADD COLUMN duration_secs double precision;

-- The best kill's length behind a boss Peak (best_raw already holds its DPS/HPS).
ALTER TABLE player_tenant_rating_boss_scores ADD COLUMN best_duration_secs double precision;

-- A raid Peak's throughput over the bosses it counts: total output over total
-- fight time, i.e. sum(best_raw * best_duration_secs) / sum(best_duration_secs).
ALTER TABLE player_tenant_rating_scope_scores ADD COLUMN best_raw double precision;
ALTER TABLE player_tenant_rating_scope_scores ADD COLUMN best_duration_secs double precision;

COMMIT;
