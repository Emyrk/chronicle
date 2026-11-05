-- name: ListTenantRatingsNeedingCopy :many
SELECT g.tenant_id FROM rating_score_generations g
LEFT JOIN tenant_rating_read_states rs ON rs.tenant_id = g.tenant_id
WHERE g.status = 'active' AND tenant_ratings_enabled(g.tenant_id)
  AND (rs.state IS NULL OR rs.state IN ('legacy', 'copying'))
ORDER BY g.tenant_id;

-- name: BeginTenantRatingCopy :exec
INSERT INTO tenant_rating_read_states (tenant_id, state)
SELECT g.tenant_id, 'copying' FROM rating_score_generations g
WHERE g.tenant_id = @tenant_id AND g.status = 'active'
ON CONFLICT (tenant_id) DO UPDATE SET state = 'copying', updated_at = now()
WHERE tenant_rating_read_states.state = 'legacy';

-- name: LockTenantRatingCopyState :one
SELECT state FROM tenant_rating_read_states WHERE tenant_id = @tenant_id FOR UPDATE;

-- name: LockTenantRatingCopyGeneration :one
SELECT id FROM rating_score_generations WHERE tenant_id = @tenant_id AND status = 'active' FOR SHARE;

-- name: StartTenantRatingCopyProgress :exec
INSERT INTO tenant_rating_copy_progress (tenant_id, generation_id, table_name)
SELECT @tenant_id::uuid, @generation_id::uuid, stage FROM unnest(ARRAY['player_boss','player_scope','guild_boss','guild_scope','peak']::text[]) AS stage
ON CONFLICT DO NOTHING;

-- name: ListTenantRatingCopyProgress :many
SELECT generation_id, table_name, after_key, completed
FROM tenant_rating_copy_progress WHERE tenant_id = @tenant_id
ORDER BY array_position(ARRAY['player_boss','player_scope','guild_boss','guild_scope','peak']::text[], table_name);

-- name: AdvanceTenantRatingCopyProgress :execrows
UPDATE tenant_rating_copy_progress SET after_key = @after_key::jsonb
WHERE tenant_id = @tenant_id AND generation_id = @generation_id AND table_name = @table_name AND NOT completed;

-- name: CompleteTenantRatingCopyProgress :execrows
UPDATE tenant_rating_copy_progress SET completed = true
WHERE tenant_id = @tenant_id AND generation_id = @generation_id AND table_name = @table_name AND NOT completed;

-- name: FinishTenantRatingCopy :execrows
UPDATE tenant_rating_read_states AS rs SET state = 'evolving', updated_at = now()
WHERE rs.tenant_id = @tenant_id AND rs.state = 'copying'
AND (SELECT count(*) FROM tenant_rating_copy_progress p
     WHERE p.tenant_id = rs.tenant_id AND p.generation_id = @generation_id AND p.completed) = 5
AND (SELECT g.id FROM rating_score_generations g WHERE g.tenant_id = rs.tenant_id AND g.status = 'active') = @generation_id;

-- name: CopyTenantRatingPlayerBossPage :one
WITH page AS MATERIALIZED (
    SELECT s.* FROM player_tenant_rating_boss_scores s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id
      AND (@after_key::jsonb IS NULL OR (s.realm_id, s.player_guid, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.rating_metric, s.window_kind) > ((@after_key::jsonb->>0)::uuid, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text, (@after_key::jsonb->>5)::smallint, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text, (@after_key::jsonb->>11)::text))
    ORDER BY s.realm_id, s.player_guid, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.rating_metric, s.window_kind LIMIT 200
), copied AS (
    INSERT INTO player_tenant_rating_boss_scores_evolving (tenant_id, realm_id, player_guid, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills, computed_at, best_duration_secs)
    SELECT tenant_id, realm_id, player_guid, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills, computed_at, best_duration_secs FROM page WHERE true
    ON CONFLICT DO NOTHING
    RETURNING 1
)
SELECT (SELECT jsonb_build_array(s.realm_id, s.player_guid, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.rating_metric, s.window_kind) FROM page s ORDER BY s.realm_id DESC, s.player_guid DESC, s.instance_name DESC, s.encounter_name DESC, s.difficulty_name DESC, s.max_players DESC, s.player_class DESC, s.player_spec DESC, s.player_sub_spec DESC, s.performance_metric DESC, s.rating_metric DESC, s.window_kind DESC LIMIT 1) AS next_key,
       (SELECT count(*) FROM page)::int AS page_size;

-- name: CopyTenantRatingPlayerScopePage :one
WITH page AS MATERIALIZED (
    SELECT s.* FROM player_tenant_rating_scope_scores s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id
      AND (@after_key::jsonb IS NULL OR (s.realm_id, s.player_guid, s.instance_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.rating_metric, s.window_kind) > ((@after_key::jsonb->>0)::uuid, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text, (@after_key::jsonb->>10)::text))
    ORDER BY s.realm_id, s.player_guid, s.instance_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.rating_metric, s.window_kind LIMIT 200
), copied AS (
    INSERT INTO player_tenant_rating_scope_scores_evolving (tenant_id, realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, computed_at, best_raw, best_duration_secs)
    SELECT tenant_id, realm_id, player_guid, instance_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind, window_start, window_end, score, computed_at, best_raw, best_duration_secs FROM page WHERE true
    ON CONFLICT DO NOTHING
    RETURNING 1
)
SELECT (SELECT jsonb_build_array(s.realm_id, s.player_guid, s.instance_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.rating_metric, s.window_kind) FROM page s ORDER BY s.realm_id DESC, s.player_guid DESC, s.instance_name DESC, s.difficulty_name DESC, s.max_players DESC, s.player_class DESC, s.player_spec DESC, s.player_sub_spec DESC, s.performance_metric DESC, s.rating_metric DESC, s.window_kind DESC LIMIT 1) AS next_key,
       (SELECT count(*) FROM page)::int AS page_size;

-- name: CopyTenantRatingGuildBossPage :one
WITH page AS MATERIALIZED (
    SELECT s.* FROM guild_tenant_rating_boss_scores s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id
      AND (@after_key::jsonb IS NULL OR (s.realm_id, s.guild_id, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.rating_metric, s.window_kind) > ((@after_key::jsonb->>0)::uuid, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::text, (@after_key::jsonb->>5)::smallint, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text))
    ORDER BY s.realm_id, s.guild_id, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.rating_metric, s.window_kind LIMIT 200
), copied AS (
    INSERT INTO guild_tenant_rating_boss_scores_evolving (tenant_id, realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills, computed_at)
    SELECT tenant_id, realm_id, guild_id, instance_name, encounter_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills, computed_at FROM page WHERE true
    ON CONFLICT DO NOTHING
    RETURNING 1
)
SELECT (SELECT jsonb_build_array(s.realm_id, s.guild_id, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.rating_metric, s.window_kind) FROM page s ORDER BY s.realm_id DESC, s.guild_id DESC, s.instance_name DESC, s.encounter_name DESC, s.difficulty_name DESC, s.max_players DESC, s.rating_metric DESC, s.window_kind DESC LIMIT 1) AS next_key,
       (SELECT count(*) FROM page)::int AS page_size;

-- name: CopyTenantRatingGuildScopePage :one
WITH page AS MATERIALIZED (
    SELECT s.* FROM guild_tenant_rating_scope_scores s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id
      AND (@after_key::jsonb IS NULL OR (s.realm_id, s.guild_id, s.instance_name, s.difficulty_name, s.max_players, s.rating_metric, s.window_kind) > ((@after_key::jsonb->>0)::uuid, (@after_key::jsonb->>1)::uuid, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text))
    ORDER BY s.realm_id, s.guild_id, s.instance_name, s.difficulty_name, s.max_players, s.rating_metric, s.window_kind LIMIT 200
), copied AS (
    INSERT INTO guild_tenant_rating_scope_scores_evolving (tenant_id, realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score, computed_at)
    SELECT tenant_id, realm_id, guild_id, instance_name, difficulty_name, max_players, rating_metric, window_kind, window_start, window_end, score, computed_at FROM page WHERE true
    ON CONFLICT DO NOTHING
    RETURNING 1
)
SELECT (SELECT jsonb_build_array(s.realm_id, s.guild_id, s.instance_name, s.difficulty_name, s.max_players, s.rating_metric, s.window_kind) FROM page s ORDER BY s.realm_id DESC, s.guild_id DESC, s.instance_name DESC, s.difficulty_name DESC, s.max_players DESC, s.rating_metric DESC, s.window_kind DESC LIMIT 1) AS next_key,
       (SELECT count(*) FROM page)::int AS page_size;

-- name: CopyTenantRatingPeakPage :one
WITH page AS MATERIALIZED (
    SELECT s.* FROM rating_peak_cohort_denominators s
    WHERE s.tenant_id = @tenant_id AND s.generation_id = @generation_id
      AND (@after_key::jsonb IS NULL OR (s.subject_kind, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.window_kind) > ((@after_key::jsonb->>0)::text, (@after_key::jsonb->>1)::text, (@after_key::jsonb->>2)::text, (@after_key::jsonb->>3)::text, (@after_key::jsonb->>4)::smallint, (@after_key::jsonb->>5)::text, (@after_key::jsonb->>6)::text, (@after_key::jsonb->>7)::text, (@after_key::jsonb->>8)::text, (@after_key::jsonb->>9)::text))
    ORDER BY s.subject_kind, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.window_kind LIMIT 200
), copied AS (
    INSERT INTO rating_peak_cohort_denominators_evolving (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, window_kind, window_start, window_end, rank_one_raw, updated_at)
    SELECT tenant_id, subject_kind, instance_name, encounter_name, difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, window_kind, window_start, window_end, rank_one_raw, updated_at FROM page WHERE true
    ON CONFLICT DO NOTHING
    RETURNING 1
)
SELECT (SELECT jsonb_build_array(s.subject_kind, s.instance_name, s.encounter_name, s.difficulty_name, s.max_players, s.player_class, s.player_spec, s.player_sub_spec, s.performance_metric, s.window_kind) FROM page s ORDER BY s.subject_kind DESC, s.instance_name DESC, s.encounter_name DESC, s.difficulty_name DESC, s.max_players DESC, s.player_class DESC, s.player_spec DESC, s.player_sub_spec DESC, s.performance_metric DESC, s.window_kind DESC LIMIT 1) AS next_key,
       (SELECT count(*) FROM page)::int AS page_size;
