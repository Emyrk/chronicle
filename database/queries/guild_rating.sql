-- Tenant-wide canonical cohort, independent of rating group membership.
-- name: ListRatingRunsForTenant :many
SELECT rr.run_id
FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND rr.run_id > @after_run_id
ORDER BY rr.run_id LIMIT @batch_size;

-- name: GuildRatingObservationsForRuns :many
-- Clean boss encounter duration, not the player DPS/HPS ranking's fight duration.
-- The fastest repeated clean encounter in a canonical run is its single boss
-- time datapoint, matching the existing time-parse membership contract.
SELECT DISTINCT ON (rr.run_id, encounter.name)
       rr.realm_id, rr.run_id, representative.guild_id,
       representative.name AS instance_name, encounter.name AS encounter_name,
       representative.difficulty_name, representative.max_players::smallint AS max_players,
       encounter.end_time AS killed_at,
       (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::double precision AS raw_duration_ms,
       (boss.server_precise_score IS NOT NULL)::boolean AS has_locked_parse,
       COALESCE(boss.server_precise_score, 0)::double precision AS locked_parse
FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN log_instances representative ON representative.id = rr.representative_instance_id
JOIN wow_log_groups log_group ON log_group.id = representative.log_group_id AND NOT log_group.unlisted
JOIN log_instance_encounters encounter ON encounter.instance_id = representative.id
LEFT JOIN LATERAL (
    SELECT b.server_precise_score
    FROM time_parse_scores score
    JOIN time_parse_boss_scores b ON b.time_parse_score_id = score.id
    JOIN log_instances scored_instance ON scored_instance.id = score.instance_id
    JOIN wow_log_groups scored_group ON scored_group.id = scored_instance.log_group_id AND NOT scored_group.unlisted
    WHERE score.tenant_id = @tenant_id AND score.run_id = rr.run_id
      AND score.realm_id = rr.realm_id AND score.guild_id IS NOT DISTINCT FROM representative.guild_id
      AND b.encounter_name = encounter.name
      AND b.server_status IN ('ok', 'low_confidence')
    ORDER BY score.computed_at DESC, score.id DESC
    LIMIT 1
) boss ON true
WHERE rr.run_id = ANY(@run_ids::uuid[])
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND representative.invalidated_at IS NULL AND encounter.boss = true
  AND encounter.kill_type = 'clean' AND encounter.end_time > encounter.start_time
ORDER BY rr.run_id, encounter.name,
         (encounter.end_time - encounter.start_time) ASC, encounter.end_time ASC, encounter.id;

-- Retain precisely one boss kill per guild/run, even if the source is later deleted.
-- name: BackfillGuildRenownFactsForSource :execrows
INSERT INTO guild_renown_kill_facts (tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
SELECT DISTINCT ON (encounter.name)
    COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    instance.realm_id, instance.guild_id, @run_id,
    instance.name, encounter.name, encounter.end_time
FROM log_instances instance
JOIN wow_server_realms realm ON realm.id = instance.realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
JOIN log_instance_encounters encounter ON encounter.instance_id = instance.id
  AND encounter.boss = true AND encounter.kill_type = 'clean'
WHERE instance.id = @representative_instance_id AND instance.guild_id IS NOT NULL
  AND (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR server.tenant_id = @tenant_id)
  AND instance.invalidated_at IS NULL AND encounter.end_time > encounter.start_time
ORDER BY encounter.name, encounter.end_time DESC, encounter.id
ON CONFLICT DO NOTHING;

-- name: BackfillGuildRenownFactsForRun :execrows
INSERT INTO guild_renown_kill_facts (tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
SELECT DISTINCT ON (encounter.name)
    COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rr.realm_id, instance.guild_id, rr.run_id,
    instance.name, encounter.name, encounter.end_time
FROM ranking_runs rr
JOIN log_instances instance ON instance.id = rr.representative_instance_id
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
JOIN log_instance_encounters encounter ON encounter.instance_id = instance.id
  AND encounter.boss = true AND encounter.kill_type = 'clean'
WHERE rr.run_id = @run_id AND instance.guild_id IS NOT NULL
  AND (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR server.tenant_id = @tenant_id)
  AND instance.invalidated_at IS NULL AND encounter.end_time > encounter.start_time
ORDER BY encounter.name, encounter.end_time DESC, encounter.id
ON CONFLICT DO NOTHING;

-- name: BackfillGuildRenownFactsForRuns :execrows
-- Repair a bounded page of canonical runs; parse refresh normally earns these facts.
INSERT INTO guild_renown_kill_facts (tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
SELECT DISTINCT ON (rr.run_id, encounter.name)
    COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rr.realm_id, instance.guild_id, rr.run_id,
    instance.name, encounter.name, encounter.end_time
FROM ranking_runs rr
JOIN log_instances instance ON instance.id = rr.representative_instance_id
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN wow_log_groups log_group ON log_group.id = instance.log_group_id AND NOT log_group.unlisted
JOIN log_instance_encounters encounter ON encounter.instance_id = instance.id
  AND encounter.boss = true AND encounter.kill_type = 'clean'
WHERE rr.run_id = ANY(@run_ids::uuid[]) AND instance.guild_id IS NOT NULL
  AND (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR server.tenant_id = @tenant_id)
  AND instance.invalidated_at IS NULL AND encounter.end_time > encounter.start_time
ORDER BY rr.run_id, encounter.name, encounter.end_time DESC, encounter.id
ON CONFLICT DO NOTHING;

-- Same bounded canonical-run repair as player Renown; no group membership gate.
-- name: DeleteGuildRenownFactsForRuns :execrows
DELETE FROM guild_renown_kill_facts
WHERE run_id = ANY(@run_ids::uuid[])
  AND cardinality(@run_ids::uuid[]) BETWEEN 1 AND 100;

-- name: ListGuildRenownFacts :many
SELECT * FROM guild_renown_kill_facts
WHERE tenant_id = @tenant_id AND realm_id = @realm_id AND guild_id = @guild_id
ORDER BY killed_at, id LIMIT @limit_count;

-- name: InsertGuildRatingBossScore :exec
INSERT INTO guild_rating_boss_scores (
    generation_id, tenant_id, realm_id, guild_id, group_id, instance_name, encounter_name,
    difficulty_name, max_players, rating_metric, window_kind, window_start, window_end,
    score, best_raw, rank_one_raw, best_locked_parse, form, floor_score, eligible_kills
) VALUES (
    @generation_id, @tenant_id, @realm_id, @guild_id, @group_id, @instance_name, @encounter_name,
    @difficulty_name, @max_players, @rating_metric, @window_kind, @window_start, @window_end,
    @score, @best_raw, @rank_one_raw, @best_locked_parse, @form, @floor_score, @eligible_kills
);

-- name: InsertGuildRatingScopeScore :exec
INSERT INTO guild_rating_scope_scores (
    generation_id, tenant_id, realm_id, guild_id, group_id, instance_name, difficulty_name,
    max_players, rating_metric, window_kind, score
) VALUES (
    @generation_id, @tenant_id, @realm_id, @guild_id, @group_id, @instance_name, @difficulty_name,
    @max_players, @rating_metric, @window_kind, @score
);

-- name: ListActiveGuildRatingBossScores :many
SELECT score.* FROM guild_rating_boss_scores score
JOIN rating_score_generations generation ON generation.id = score.generation_id
  AND generation.tenant_id = score.tenant_id AND generation.status = 'active'
JOIN rating_realm_group_memberships membership ON membership.realm_id = score.realm_id
  AND membership.group_id = score.group_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.group_id = @group_id AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
ORDER BY score.score DESC, score.realm_id, score.guild_id LIMIT @limit_count;

-- name: ListActiveGuildRatingScopeScores :many
SELECT score.* FROM guild_rating_scope_scores score
JOIN rating_score_generations generation ON generation.id = score.generation_id
  AND generation.tenant_id = score.tenant_id AND generation.status = 'active'
JOIN rating_realm_group_memberships membership ON membership.realm_id = score.realm_id
  AND membership.group_id = score.group_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE score.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.group_id = @group_id AND score.instance_name = @instance_name
  AND score.difficulty_name = @difficulty_name AND score.max_players = @max_players
  AND score.rating_metric = @rating_metric AND score.window_kind = @window_kind
ORDER BY score.score DESC, score.realm_id, score.guild_id LIMIT @limit_count;

-- name: ListGroupGuildRenownFacts :many
SELECT fact.realm_id, fact.guild_id, fact.run_id, fact.instance_name,
       fact.encounter_name, fact.killed_at, fact.id
FROM guild_renown_kill_facts fact
JOIN rating_realm_group_memberships membership ON membership.realm_id = fact.realm_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND fact.tenant_id = @tenant_id AND grp.id = @group_id
  AND (@window_start::timestamptz IS NULL OR fact.killed_at >= @window_start)
  AND (@window_end::timestamptz IS NULL OR fact.killed_at < @window_end)
  AND (fact.killed_at, fact.id) > (@after_killed_at::timestamptz, @after_id::uuid)
ORDER BY fact.killed_at, fact.id
LIMIT GREATEST(@batch_size::int, 0);
