-- name: PutRatingRaidPolicy :execrows
INSERT INTO rating_group_raid_policies (group_id, instance_name, peak_weight, mastery_weight)
SELECT policy.group_id, @instance_name, @peak_weight, @mastery_weight
FROM rating_group_policies policy
JOIN rating_realm_groups grp ON grp.id = policy.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE policy.group_id = @group_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (group_id, instance_name) DO UPDATE SET
    peak_weight = EXCLUDED.peak_weight,
    mastery_weight = EXCLUDED.mastery_weight;

-- name: DeleteRatingRaidPolicy :execrows
DELETE FROM rating_group_raid_policies raid
USING rating_realm_groups grp, wow_servers server
WHERE raid.group_id = grp.id AND grp.server_id = server.id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND raid.group_id = @group_id AND raid.instance_name = @instance_name;

-- name: ListRatingRaidPolicies :many
SELECT raid.*
FROM rating_group_raid_policies raid
JOIN rating_realm_groups grp ON grp.id = raid.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE raid.group_id = @group_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
ORDER BY raid.instance_name;

-- name: InsertRatingScopeScore :exec
INSERT INTO rating_scope_scores (
    generation_id, tenant_id, group_id, realm_id, player_guid, instance_name,
    difficulty_name, max_players, player_class, player_spec, player_sub_spec,
    performance_metric, rating_metric, window_kind, score
) VALUES (
    @generation_id, @tenant_id, @group_id, @realm_id, @player_guid, @instance_name,
    @difficulty_name, @max_players, @player_class, @player_spec, @player_sub_spec,
    @performance_metric, @rating_metric, @window_kind, @score
);

-- name: ListActiveRatingScopeScores :many
SELECT score.*
FROM rating_scope_scores score
JOIN rating_score_generations generation
  ON generation.id = score.generation_id AND generation.tenant_id = score.tenant_id
  AND generation.status = 'active'
JOIN rating_realm_group_memberships membership
  ON membership.realm_id = score.realm_id AND membership.group_id = score.group_id
JOIN rating_realm_groups grp ON grp.id = membership.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE score.tenant_id = @tenant_id AND generation.tenant_id = @tenant_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND score.group_id = @group_id AND score.instance_name = @instance_name
  AND score.difficulty_name = @difficulty_name AND score.max_players = @max_players
  AND score.player_class = @player_class AND score.player_spec = @player_spec
  AND score.player_sub_spec = @player_sub_spec
  AND score.performance_metric = @performance_metric AND score.rating_metric = @rating_metric
  AND score.window_kind = @window_kind
ORDER BY score.score DESC, score.realm_id, score.player_guid
LIMIT LEAST(GREATEST(@limit_count::int, 1), 100);
