BEGIN;
-- Compatibility projections keep the published row shape and represent the absence
-- of a generation with the nil UUID. They do not manufacture a generation row.
CREATE VIEW player_tenant_rating_boss_scores_evolving_read AS
SELECT '00000000-0000-0000-0000-000000000000'::uuid AS generation_id,
       tenant_id, realm_id, player_guid, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills, computed_at, COALESCE(best_duration_secs, 0)::float8 AS best_duration_secs
FROM player_tenant_rating_boss_scores_evolving
WHERE tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
   OR current_setting('app.tenant_bypass', true) = 'true';

CREATE VIEW player_tenant_rating_scope_scores_evolving_read AS
SELECT '00000000-0000-0000-0000-000000000000'::uuid AS generation_id,
       tenant_id, realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, computed_at, COALESCE(best_raw, 0)::float8 AS best_raw, COALESCE(best_duration_secs, 0)::float8 AS best_duration_secs
FROM player_tenant_rating_scope_scores_evolving
WHERE tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
   OR current_setting('app.tenant_bypass', true) = 'true';

CREATE VIEW guild_tenant_rating_boss_scores_evolving_read AS
SELECT '00000000-0000-0000-0000-000000000000'::uuid AS generation_id,
       tenant_id, realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills, computed_at
FROM guild_tenant_rating_boss_scores_evolving
WHERE tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
   OR current_setting('app.tenant_bypass', true) = 'true';

CREATE VIEW guild_tenant_rating_scope_scores_evolving_read AS
SELECT '00000000-0000-0000-0000-000000000000'::uuid AS generation_id,
       tenant_id, realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score, computed_at
FROM guild_tenant_rating_scope_scores_evolving
WHERE tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
   OR current_setting('app.tenant_bypass', true) = 'true';

COMMIT;
