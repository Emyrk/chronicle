-- Periodic dispatch only visits tenants with pending fact changes.
-- name: ListDirtyRenownTenants :many
SELECT DISTINCT tenant_id FROM rating_dirty_renown_subjects ORDER BY tenant_id;

-- Workers lock a bounded batch inside their score-write transaction. Concurrent
-- updates to the same key wait, then increment its revision. The CAS delete
-- keeps a newer change queued instead of losing it behind an in-flight worker.
-- name: LockDirtyRenownSubjects :many
SELECT tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name, revision
FROM rating_dirty_renown_subjects
WHERE tenant_id = @tenant_id
ORDER BY changed_at, subject_kind, realm_id, subject_id, instance_name, encounter_name
LIMIT LEAST(GREATEST(@batch_size::int, 0), 100)
FOR UPDATE SKIP LOCKED;

-- name: DeleteDirtyRenownSubjectIfRevision :execrows
DELETE FROM rating_dirty_renown_subjects
WHERE tenant_id = @tenant_id AND subject_kind = @subject_kind AND realm_id = @realm_id
  AND subject_id = @subject_id AND instance_name = @instance_name
  AND encounter_name = @encounter_name AND revision = @revision;

-- name: CountPlayerRenownFactsForSubject :one
SELECT count(*)::int AS career_kills,
       count(*) FILTER (WHERE killed_at >= @period_start::timestamptz
                          AND killed_at < @as_of::timestamptz)::int AS period_kills
FROM renown_kill_facts
WHERE realm_id = @realm_id AND player_guid = @player_guid
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND killed_at < @as_of::timestamptz;

-- name: CountGuildRenownFactsForSubject :one
SELECT count(*)::int AS career_kills,
       count(*) FILTER (WHERE killed_at >= @period_start::timestamptz
                          AND killed_at < @as_of::timestamptz)::int AS period_kills
FROM guild_renown_kill_facts
WHERE tenant_id = @tenant_id AND realm_id = @realm_id AND guild_id = @guild_id
  AND instance_name = @instance_name AND encounter_name = @encounter_name
  AND killed_at < @as_of::timestamptz;

-- name: LockActiveTenantRatingGeneration :one
SELECT id FROM rating_score_generations
WHERE tenant_id = @tenant_id AND status = 'active'
FOR SHARE;

-- name: DeletePlayerTenantRenownBoss :exec
DELETE FROM player_tenant_rating_boss_scores AS score
WHERE score.generation_id = @generation_id AND score.tenant_id = @tenant_id
  AND score.realm_id = @realm_id AND score.player_guid = @player_guid
  AND score.instance_name = @instance_name AND score.encounter_name = @encounter_name
  AND score.rating_metric = 'renown' AND score.window_kind = @window_kind;

-- name: UpsertPlayerTenantRenownBoss :execrows
INSERT INTO player_tenant_rating_boss_scores
    (generation_id, tenant_id, realm_id, player_guid, instance_name, encounter_name,
     performance_metric, rating_metric, window_kind, window_start, window_end,
     score, eligible_kills)
SELECT gen.id, gen.tenant_id, realm.id, @player_guid, @instance_name, @encounter_name,
       'none', 'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, @score::double precision, @eligible_kills::int
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND @eligible_kills::int > 0
ON CONFLICT (generation_id, tenant_id, realm_id, player_guid, instance_name,
             encounter_name, difficulty_name, max_players, player_class,
             player_spec, player_sub_spec, performance_metric, rating_metric, window_kind)
DO UPDATE SET score = EXCLUDED.score, eligible_kills = EXCLUDED.eligible_kills,
              window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
              computed_at = now();

-- name: DeleteGuildTenantRenownBoss :exec
DELETE FROM guild_tenant_rating_boss_scores AS score
WHERE score.generation_id = @generation_id AND score.tenant_id = @tenant_id
  AND score.realm_id = @realm_id AND score.guild_id = @guild_id
  AND score.instance_name = @instance_name AND score.encounter_name = @encounter_name
  AND score.rating_metric = 'renown' AND score.window_kind = @window_kind;

-- name: UpsertGuildTenantRenownBoss :execrows
INSERT INTO guild_tenant_rating_boss_scores
    (generation_id, tenant_id, realm_id, guild_id, instance_name, encounter_name,
     rating_metric, window_kind, window_start, window_end, score, eligible_kills)
SELECT gen.id, gen.tenant_id, realm.id, guild.id, @instance_name, @encounter_name,
       'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, @score::double precision, @eligible_kills::int
FROM rating_score_generations gen
JOIN wow_server_realms realm ON realm.id = @realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN guilds guild ON guild.id = @guild_id AND guild.realm_id = realm.id
WHERE gen.id = @generation_id AND gen.tenant_id = @tenant_id AND gen.status = 'active'
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND @eligible_kills::int > 0
ON CONFLICT (generation_id, tenant_id, realm_id, guild_id, instance_name,
             encounter_name, difficulty_name, max_players, rating_metric, window_kind)
DO UPDATE SET score = EXCLUDED.score, eligible_kills = EXCLUDED.eligible_kills,
              window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
              computed_at = now();

-- name: DeletePlayerTenantRenownScope :exec
DELETE FROM player_tenant_rating_scope_scores AS scope
WHERE scope.generation_id = @generation_id AND scope.tenant_id = @tenant_id
  AND scope.realm_id = @realm_id AND scope.player_guid = @player_guid
  AND scope.rating_metric = 'renown' AND scope.window_kind = @window_kind
  AND scope.instance_name = @instance_name;

-- name: InsertPlayerTenantRenownScopes :exec
INSERT INTO player_tenant_rating_scope_scores
    (generation_id, tenant_id, realm_id, player_guid, instance_name, performance_metric,
     rating_metric, window_kind, window_start, window_end, score)
SELECT @generation_id, @tenant_id, @realm_id, @player_guid, boss.instance_name,
       'none', 'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, sum(boss.score)::double precision
FROM player_tenant_rating_boss_scores boss
WHERE boss.generation_id = @generation_id AND boss.tenant_id = @tenant_id
  AND boss.realm_id = @realm_id AND boss.player_guid = @player_guid
  AND boss.rating_metric = 'renown' AND boss.window_kind = @window_kind
  AND boss.instance_name = @instance_name
GROUP BY boss.instance_name;

-- name: DeleteGuildTenantRenownScope :exec
DELETE FROM guild_tenant_rating_scope_scores AS scope
WHERE scope.generation_id = @generation_id AND scope.tenant_id = @tenant_id
  AND scope.realm_id = @realm_id AND scope.guild_id = @guild_id
  AND scope.rating_metric = 'renown' AND scope.window_kind = @window_kind
  AND scope.instance_name = @instance_name;

-- name: InsertGuildTenantRenownScopes :exec
INSERT INTO guild_tenant_rating_scope_scores
    (generation_id, tenant_id, realm_id, guild_id, instance_name, rating_metric,
     window_kind, window_start, window_end, score)
SELECT @generation_id, @tenant_id, @realm_id, @guild_id, boss.instance_name,
       'renown', @window_kind, sqlc.narg(window_start)::timestamptz,
       sqlc.narg(window_end)::timestamptz, sum(boss.score)::double precision
FROM guild_tenant_rating_boss_scores boss
WHERE boss.generation_id = @generation_id AND boss.tenant_id = @tenant_id
  AND boss.realm_id = @realm_id AND boss.guild_id = @guild_id
  AND boss.rating_metric = 'renown' AND boss.window_kind = @window_kind
  AND boss.instance_name = @instance_name
GROUP BY boss.instance_name;

-- Do not discard dirty keys while a frozen full rebuild may replace the active
-- projection with a snapshot older than these fact changes.
-- name: TenantRatingGenerationBuilding :one
SELECT EXISTS (SELECT 1 FROM rating_score_generations
               WHERE tenant_id = @tenant_id AND status = 'building');

-- Serialize incremental publication with full rebuild start/publish, both of
-- which lock this tenant revision row. A later rebuild snapshots our writes.
-- An earlier rebuilding generation keeps dirty keys queued until it publishes.
-- name: LockTenantRatingRevision :one
SELECT revision FROM rating_config_revisions
WHERE tenant_id = @tenant_id FOR UPDATE;

-- Daily period expiry scans only active projected Renown rows, not the full
-- historical fact table. Each subject's fact lookup uses existing subject
-- indexes. The caller keyset-paginates both kinds and marks expired keys.
-- name: ListPlayerRenownExpiryPage :many
SELECT score.realm_id, score.player_guid, score.instance_name, score.encounter_name,
       EXISTS (
           SELECT 1 FROM renown_kill_facts fact
           WHERE fact.realm_id = score.realm_id AND fact.player_guid = score.player_guid
             AND fact.instance_name = score.instance_name AND fact.encounter_name = score.encounter_name
             AND fact.killed_at >= score.window_start AND fact.killed_at < @period_start::timestamptz
       ) AS expired
FROM player_tenant_rating_boss_scores score
JOIN rating_score_generations gen ON gen.id = score.generation_id AND gen.status = 'active'
WHERE score.tenant_id = @tenant_id AND score.rating_metric = 'renown'
  AND score.window_kind = 'period' AND score.window_start < @period_start::timestamptz
  AND (score.realm_id, score.player_guid, score.instance_name, score.encounter_name) >
      (@after_realm_id::uuid, @after_player_guid::text, @after_instance_name::text, @after_encounter_name::text)
ORDER BY score.realm_id, score.player_guid, score.instance_name, score.encounter_name
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: ListGuildRenownExpiryPage :many
SELECT score.realm_id, score.guild_id, score.instance_name, score.encounter_name,
       EXISTS (
           SELECT 1 FROM guild_renown_kill_facts fact
           WHERE fact.tenant_id = score.tenant_id AND fact.realm_id = score.realm_id
             AND fact.guild_id = score.guild_id AND fact.instance_name = score.instance_name
             AND fact.encounter_name = score.encounter_name
             AND fact.killed_at >= score.window_start AND fact.killed_at < @period_start::timestamptz
       ) AS expired
FROM guild_tenant_rating_boss_scores score
JOIN rating_score_generations gen ON gen.id = score.generation_id AND gen.status = 'active'
WHERE score.tenant_id = @tenant_id AND score.rating_metric = 'renown'
  AND score.window_kind = 'period' AND score.window_start < @period_start::timestamptz
  AND (score.realm_id, score.guild_id, score.instance_name, score.encounter_name) >
      (@after_realm_id::uuid, @after_guild_id::uuid, @after_instance_name::text, @after_encounter_name::text)
ORDER BY score.realm_id, score.guild_id, score.instance_name, score.encounter_name
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);

-- name: MarkDirtyRenownSubject :exec
INSERT INTO rating_dirty_renown_subjects
    (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
VALUES (@tenant_id, @subject_kind, @realm_id, @subject_id, @instance_name, @encounter_name)
ON CONFLICT (tenant_id, subject_kind, realm_id, subject_id, instance_name, encounter_name)
DO UPDATE SET revision = rating_dirty_renown_subjects.revision + 1, changed_at = now();
