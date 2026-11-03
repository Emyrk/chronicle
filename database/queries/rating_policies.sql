-- name: ListLatestRenownTemplateBosses :many
SELECT boss.instance_name, boss.encounter_name, boss.renown_points
FROM rating_renown_template_bosses boss
WHERE boss.flavor = ANY(@flavors::text[])
  AND boss.version = (
    SELECT max(template.version)
    FROM rating_renown_templates template
    WHERE template.flavor = boss.flavor
  )
ORDER BY boss.instance_name, boss.encounter_name;

-- Group configuration is explicit: no group has score eligibility until both
-- a policy and eligible boss rows have been configured by an operator.
-- name: ListTenantRatingPolicies :many
SELECT policy.*
FROM rating_group_policies policy
JOIN rating_realm_groups grp ON grp.id = policy.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
ORDER BY policy.group_id;

-- name: ListRatingBossPolicies :many
SELECT boss.*
FROM rating_group_boss_policies boss
JOIN rating_realm_groups grp ON grp.id = boss.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AND boss.group_id = @group_id
ORDER BY boss.instance_name, boss.encounter_name;

-- name: PutRatingGroupPolicy :execrows
INSERT INTO rating_group_policies (
    group_id, version, period_days, half_life_days, best_weight,
    form_weight, floor_weight, rank_one_weight, full_rank_kills
)
SELECT grp.id, @version, @period_days, @half_life_days, @best_weight,
       @form_weight, @floor_weight, @rank_one_weight, @full_rank_kills
FROM rating_realm_groups grp
JOIN wow_servers server ON server.id = grp.server_id
WHERE grp.id = @group_id AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (group_id) DO UPDATE SET
    version = EXCLUDED.version,
    period_days = EXCLUDED.period_days,
    half_life_days = EXCLUDED.half_life_days,
    best_weight = EXCLUDED.best_weight,
    form_weight = EXCLUDED.form_weight,
    floor_weight = EXCLUDED.floor_weight,
    rank_one_weight = EXCLUDED.rank_one_weight,
    full_rank_kills = EXCLUDED.full_rank_kills,
    updated_at = now()
WHERE rating_group_policies.version < EXCLUDED.version;

-- name: PutRatingBossPolicy :execrows
INSERT INTO rating_group_boss_policies (
    group_id, instance_name, encounter_name, peak_weight, mastery_weight,
    renown_points
)
SELECT policy.group_id, @instance_name, @encounter_name, @peak_weight,
       @mastery_weight, @renown_points
FROM rating_group_policies policy
JOIN rating_realm_groups grp ON grp.id = policy.group_id
JOIN wow_servers server ON server.id = grp.server_id
WHERE policy.group_id = @group_id AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (group_id, instance_name, encounter_name) DO UPDATE SET
    peak_weight = EXCLUDED.peak_weight,
    mastery_weight = EXCLUDED.mastery_weight,
    renown_points = EXCLUDED.renown_points;

-- name: DeleteRatingBossPolicy :execrows
DELETE FROM rating_group_boss_policies boss
USING rating_realm_groups grp, wow_servers server
WHERE boss.group_id = grp.id AND grp.server_id = server.id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AND boss.group_id = @group_id
  AND boss.instance_name = @instance_name AND boss.encounter_name = @encounter_name;
