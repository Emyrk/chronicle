-- name: RepairOperationPlayerBossBenchmarks :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric FROM leaderboard_player_boss_benchmarks WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint), COALESCE((@cursor_scope::jsonb->>'encounter_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'player_class')::text,''::text), COALESCE((@cursor_scope::jsonb->>'player_spec')::text,''::text), COALESCE((@cursor_scope::jsonb->>'player_sub_spec')::text,''::text), COALESCE((@cursor_scope::jsonb->>'metric')::text,''::text)) ORDER BY instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_player_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric) DO UPDATE SET revision=leaderboard_dirty_player_boss_benchmarks.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_player_boss_benchmarks.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC, encounter_name DESC, player_class DESC, player_spec DESC, player_sub_spec DESC, metric DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

-- name: RepairOperationPlayerBossSubjects :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid FROM leaderboard_player_boss_subjects WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint), COALESCE((@cursor_scope::jsonb->>'encounter_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'player_class')::text,''::text), COALESCE((@cursor_scope::jsonb->>'player_spec')::text,''::text), COALESCE((@cursor_scope::jsonb->>'player_sub_spec')::text,''::text), COALESCE((@cursor_scope::jsonb->>'metric')::text,''::text), COALESCE((@cursor_scope::jsonb->>'realm_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE((@cursor_scope::jsonb->>'player_guid')::text,''::text)) ORDER BY instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_player_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid) DO UPDATE SET revision=leaderboard_dirty_player_boss_subjects.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_player_boss_subjects.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC, encounter_name DESC, player_class DESC, player_spec DESC, player_sub_spec DESC, metric DESC, realm_id DESC, player_guid DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

-- name: RepairOperationGuildBossBenchmarks :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name FROM leaderboard_guild_boss_benchmarks WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players, encounter_name)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint), COALESCE((@cursor_scope::jsonb->>'encounter_name')::text,''::text)) ORDER BY instance_name, difficulty_name, max_players, encounter_name LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_guild_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name) DO UPDATE SET revision=leaderboard_dirty_guild_boss_benchmarks.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_guild_boss_benchmarks.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC, encounter_name DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

-- name: RepairOperationGuildBossSubjects :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id FROM leaderboard_guild_boss_subjects WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint), COALESCE((@cursor_scope::jsonb->>'encounter_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'realm_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE((@cursor_scope::jsonb->>'guild_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid)) ORDER BY instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_guild_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET revision=leaderboard_dirty_guild_boss_subjects.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_guild_boss_subjects.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC, encounter_name DESC, realm_id DESC, guild_id DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

-- name: RepairOperationGuildClearBenchmarks :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players FROM leaderboard_guild_clear_benchmarks WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint)) ORDER BY instance_name, difficulty_name, max_players LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_guild_clear_benchmarks (tenant_id, instance_name, difficulty_name, max_players,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players) DO UPDATE SET revision=leaderboard_dirty_guild_clear_benchmarks.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_guild_clear_benchmarks.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

-- name: RepairOperationGuildClearSubjects :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id FROM leaderboard_guild_clear_subjects WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players, realm_id, guild_id)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint), COALESCE((@cursor_scope::jsonb->>'realm_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE((@cursor_scope::jsonb->>'guild_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid)) ORDER BY instance_name, difficulty_name, max_players, realm_id, guild_id LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_guild_clear_subjects (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id) DO UPDATE SET revision=leaderboard_dirty_guild_clear_subjects.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_guild_clear_subjects.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC, realm_id DESC, guild_id DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

-- name: RepairOperationPlayerRenownCounts :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid FROM leaderboard_player_renown_counts WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint), COALESCE((@cursor_scope::jsonb->>'encounter_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'realm_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE((@cursor_scope::jsonb->>'player_guid')::text,''::text)) ORDER BY instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_player_renown (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid) DO UPDATE SET revision=leaderboard_dirty_player_renown.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_player_renown.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC, encounter_name DESC, realm_id DESC, player_guid DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

-- name: RepairOperationGuildRenownCounts :one
WITH page AS MATERIALIZED (
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id FROM leaderboard_guild_renown_counts WHERE tenant_id= @tenant_id::uuid AND computed_at<= @cutoff::timestamptz
 AND (instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id)>(COALESCE((@cursor_scope::jsonb->>'instance_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'difficulty_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'max_players')::smallint,-1::smallint), COALESCE((@cursor_scope::jsonb->>'encounter_name')::text,''::text), COALESCE((@cursor_scope::jsonb->>'realm_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE((@cursor_scope::jsonb->>'guild_id')::uuid,'00000000-0000-0000-0000-000000000000'::uuid)) ORDER BY instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id LIMIT 100
), enqueued AS (
 INSERT INTO leaderboard_dirty_guild_renown (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id,process_after)
 SELECT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id,clock_timestamp() FROM page
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET revision=leaderboard_dirty_guild_renown.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_guild_renown.process_after,EXCLUDED.process_after) RETURNING 1
) SELECT (SELECT count(*) FROM enqueued)::bigint AS page_count,COALESCE((SELECT to_jsonb(page) FROM page ORDER BY instance_name DESC, difficulty_name DESC, max_players DESC, encounter_name DESC, realm_id DESC, guild_id DESC LIMIT 1),'{}'::jsonb)::jsonb AS last_cursor;

