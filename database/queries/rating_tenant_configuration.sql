-- Future tenant-wide writer configuration; old group readers remain unchanged.
-- The 180-day window is a fixed scoring rule, not an admin policy column.
-- Only tenants with an approved scoring policy can be scheduled. Root uses
-- the zero UUID, not a nullable server association or a group membership.
-- name: ListConfiguredTenantRatingTenants :many
SELECT tenant_id FROM rating_tenant_policies ORDER BY tenant_id;

-- name: GetTenantRatingPolicy :one
SELECT * FROM rating_tenant_policies WHERE tenant_id = @tenant_id;

-- Non-serving tenant checkpoint entry point. The group writer must not use it.
-- Missing tenant policy raises an error rather than inventing scoring defaults.
-- name: StartTenantRatingRebuild :one
SELECT start_tenant_rating_rebuild(@tenant_id::uuid, @as_of::timestamptz,
                                   @source_cutoff::timestamptz)::uuid;

-- Tenant policy values are maintained through migrations. Its absence must
-- fail the tenant writer closed, not restrict Peak/Mastery boss eligibility.
-- name: PutTenantRatingPolicy :execrows
INSERT INTO rating_tenant_policies (
    tenant_id, version, half_life_days, best_weight, form_weight,
    floor_weight, rank_one_weight, full_rank_kills
) VALUES (
    @tenant_id, @version, @half_life_days, @best_weight, @form_weight,
    @floor_weight, @rank_one_weight, @full_rank_kills
)
ON CONFLICT (tenant_id) DO UPDATE SET
    version = EXCLUDED.version, half_life_days = EXCLUDED.half_life_days,
    best_weight = EXCLUDED.best_weight, form_weight = EXCLUDED.form_weight,
    floor_weight = EXCLUDED.floor_weight, rank_one_weight = EXCLUDED.rank_one_weight,
    full_rank_kills = EXCLUDED.full_rank_kills, updated_at = now()
WHERE rating_tenant_policies.version < EXCLUDED.version;

-- name: ListTenantRenownBosses :many
SELECT * FROM rating_tenant_renown_bosses
WHERE tenant_id = @tenant_id ORDER BY instance_name, encounter_name;

-- Curated Renown points are independent of Peak/Mastery boss eligibility.
-- name: PutTenantRenownBoss :execrows
INSERT INTO rating_tenant_renown_bosses (tenant_id, instance_name, encounter_name, renown_points)
VALUES (@tenant_id, @instance_name, @encounter_name, @renown_points)
ON CONFLICT (tenant_id, instance_name, encounter_name) DO UPDATE
SET renown_points = EXCLUDED.renown_points
WHERE rating_tenant_renown_bosses.renown_points IS DISTINCT FROM EXCLUDED.renown_points;

-- name: DeleteTenantRenownBoss :execrows
DELETE FROM rating_tenant_renown_bosses
WHERE tenant_id = @tenant_id AND instance_name = @instance_name AND encounter_name = @encounter_name;
