-- Current-state named groups. A realm move changes its present cohort, not
-- its realm-scoped evidence. All management queries require tenant ownership.
-- name: CreateRatingRealmGroup :one
INSERT INTO rating_realm_groups (server_id, name)
SELECT server.id, @name
FROM wow_servers server
WHERE server.id = @server_id AND server.tenant_id = @tenant_id
RETURNING *;

-- name: ListRatingRealmGroups :many
SELECT grp.*
FROM rating_realm_groups grp
JOIN wow_servers server ON server.id = grp.server_id
WHERE server.tenant_id = @tenant_id
ORDER BY grp.server_id, grp.name, grp.id;

-- name: RenameRatingRealmGroup :execrows
UPDATE rating_realm_groups grp
SET name = @name
FROM wow_servers server
WHERE grp.id = @group_id AND server.id = grp.server_id AND server.tenant_id = @tenant_id;

-- name: DeleteRatingRealmGroup :execrows
DELETE FROM rating_realm_groups grp
USING wow_servers server
WHERE grp.id = @group_id AND server.id = grp.server_id AND server.tenant_id = @tenant_id;

-- name: AssignRatingRealmToGroup :execrows
INSERT INTO rating_realm_group_memberships (realm_id, server_id, group_id)
SELECT realm.id, realm.server_id, grp.id
FROM wow_server_realms realm
JOIN rating_realm_groups grp ON grp.server_id = realm.server_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE realm.id = @realm_id AND grp.id = @group_id AND server.tenant_id = @tenant_id
ON CONFLICT (realm_id) DO UPDATE SET group_id = EXCLUDED.group_id;

-- name: UnassignRatingRealmFromGroup :execrows
DELETE FROM rating_realm_group_memberships membership
USING wow_server_realms realm, wow_servers server
WHERE membership.realm_id = @realm_id
  AND realm.id = membership.realm_id AND server.id = realm.server_id
  AND server.tenant_id = @tenant_id;

-- name: ListRatingRealmGroupMembers :many
SELECT realm.id, realm.name
FROM rating_realm_group_memberships membership
JOIN wow_server_realms realm ON realm.id = membership.realm_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE grp.id = @group_id AND server.tenant_id = @tenant_id
ORDER BY realm.name, realm.id;

-- name: ListActiveGroupBossRatingScores :many
SELECT score.*
FROM rating_boss_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id
 AND generation.tenant_id = score.tenant_id
 AND generation.status = 'active'
JOIN rating_realm_group_memberships membership ON membership.realm_id = score.realm_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE server.tenant_id = @tenant_id AND score.tenant_id = @tenant_id
  AND grp.id = @group_id AND score.group_id = grp.id
  AND score.instance_name = @instance_name
  AND score.encounter_name = @encounter_name
  AND score.difficulty_name = @difficulty_name
  AND score.max_players = @max_players
  AND score.player_class = @player_class
  AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
  AND score.performance_metric = @performance_metric
  AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT @limit_count;

-- name: ListGroupRenownFacts :many
-- Read retained evidence for the current group. Weight and boss eligibility
-- are applied by the versioned group policy when computing career/period totals.
SELECT fact.realm_id, fact.player_guid, fact.instance_name, fact.encounter_name,
       fact.killed_at, fact.id
FROM renown_kill_facts fact
JOIN rating_realm_group_memberships membership ON membership.realm_id = fact.realm_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE server.tenant_id = @tenant_id AND grp.id = @group_id
  AND (@window_start::timestamptz IS NULL OR fact.killed_at >= @window_start)
  AND (@window_end::timestamptz IS NULL OR fact.killed_at < @window_end)
  AND (fact.killed_at, fact.id) > (@after_killed_at::timestamptz, @after_id::uuid)
ORDER BY fact.killed_at, fact.id
LIMIT GREATEST(@batch_size::int, 0);
