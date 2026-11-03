BEGIN;

DROP TABLE guild_tenant_rating_scope_scores;
DROP TABLE guild_tenant_rating_boss_scores;
DROP TABLE player_tenant_rating_scope_scores;
DROP TABLE player_tenant_rating_boss_scores;
DROP INDEX rating_score_generations_tenant_fk_idx;

COMMIT;
