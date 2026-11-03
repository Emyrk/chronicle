BEGIN;

ALTER TABLE player_tenant_rating_scope_scores DROP COLUMN best_duration_secs;
ALTER TABLE player_tenant_rating_scope_scores DROP COLUMN best_raw;
ALTER TABLE player_tenant_rating_boss_scores DROP COLUMN best_duration_secs;
ALTER TABLE rating_stage_player_observations DROP COLUMN duration_secs;

COMMIT;
