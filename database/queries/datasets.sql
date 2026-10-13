-- Dataset queries. These run with AdminBypass context since the datasets table
-- itself is not behind RLS.

-- name: GetDataset :one
SELECT * FROM datasets WHERE id = $1;

-- name: GetDatasetBySlug :one
SELECT * FROM datasets WHERE slug = $1;

-- name: ListDatasets :many
SELECT * FROM datasets ORDER BY name;

-- name: InsertDataset :one
INSERT INTO datasets (name, slug, wow_version, build_version, description, default_flavor, icon_base_url)
VALUES (@name, @slug, @wow_version, @build_version, @description, @default_flavor, @icon_base_url)
RETURNING *;

-- name: UpdateDataset :one
-- Only non-null params are applied; NULL means "keep existing value".
UPDATE datasets SET
    name              = COALESCE(sqlc.narg('name'), name),
    slug              = COALESCE(sqlc.narg('slug'), slug),
    wow_version       = COALESCE(sqlc.narg('wow_version'), wow_version),
    build_version     = COALESCE(sqlc.narg('build_version'), build_version),
    description       = COALESCE(sqlc.narg('description'), description),
    default_flavor    = COALESCE(sqlc.narg('default_flavor'), default_flavor),
    icon_base_url     = COALESCE(sqlc.narg('icon_base_url'), icon_base_url),
    updated_at        = now()
WHERE id = @id
RETURNING *;

-- name: DeleteDataset :exec
DELETE FROM datasets WHERE id = $1;

-- name: ListTenantsByDataset :many
-- Tenants that use this dataset, either directly (tenant.default_dataset_id)
-- or via a server they own (wow_servers.default_dataset_id).
SELECT DISTINCT t.id, t.name, t.slug
FROM tenants t
WHERE t.default_dataset_id = $1
   OR EXISTS (
     SELECT 1 FROM wow_servers s
     WHERE s.tenant_id = t.id AND s.default_dataset_id = $1
   )
ORDER BY t.name;

-- name: ResolveDatasetByRealm :one
-- Resolves the dataset for a realm. Precedence:
--   server.default_dataset_id > tenant.default_dataset_id.
-- The result is NULL when neither is set (and when the realm is unknown the
-- query returns no rows); in both cases the caller falls back to the
-- compiled-in default dataset.
SELECT
    s.default_dataset_id AS server_dataset_id,
    t.default_dataset_id AS tenant_dataset_id
FROM wow_server_realms r
JOIN wow_servers s ON s.id = r.server_id
LEFT JOIN tenants t ON t.id = s.tenant_id
WHERE r.id = $1;

-- name: ResolveDatasetWithFlavorByRealm :one
-- Resolves the dataset for a realm and returns its default flavor plus the
-- tenant's additive flavor tags. Dataset selection uses the same precedence as
-- ResolveDatasetByRealm; tenant tags augment rather than replace dataset tags.
SELECT d.id AS dataset_id, d.default_flavor, COALESCE(t.additional_flavor, '{}')::text[] AS additional_flavor
FROM wow_server_realms r
JOIN wow_servers s ON s.id = r.server_id
LEFT JOIN tenants t ON t.id = s.tenant_id
JOIN datasets d ON d.id = COALESCE(
    NULLIF(s.default_dataset_id, '00000000-0000-0000-0000-000000000000'::uuid),
    NULLIF(t.default_dataset_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE r.id = $1;

-- name: GetDatasetImportSummary :one
-- Returns row counts for each per-dataset data table, plus whether talent
-- trees have been imported. Used by the dataset management UI.
SELECT
    (SELECT COUNT(*) FROM dbc_spells s WHERE s.dataset_id = $1)::INT AS spells_count,
    (SELECT COUNT(*) FROM world_creature_template ct WHERE ct.dataset_id = $1)::INT AS creatures_count,
    (SELECT COUNT(*) FROM world_item_template it WHERE it.dataset_id = $1)::INT AS items_count,
    (SELECT COUNT(*) FROM dbc_item_display_info di WHERE di.dataset_id = $1)::INT AS item_display_count,
    (SELECT COUNT(*) FROM dbc_spell_item_enchantment se WHERE se.dataset_id = $1)::INT AS enchantments_count,
    (SELECT COUNT(*) FROM dbc_item_random_properties rp WHERE rp.dataset_id = $1)::INT AS random_properties_count,
    (SELECT COUNT(*) FROM dbc_item_set ist WHERE ist.dataset_id = $1)::INT AS item_sets_count,
    (SELECT COUNT(*) FROM dbc_spell_cast_times WHERE dataset_id = $1)::INT AS cast_times_count,
    (SELECT COUNT(*) FROM dbc_spell_durations WHERE dataset_id = $1)::INT AS durations_count,
    (SELECT COUNT(*) FROM dbc_spell_ranges WHERE dataset_id = $1)::INT AS ranges_count,
    (SELECT COUNT(*) FROM dbc_spell_icons WHERE dataset_id = $1)::INT AS icons_count,
    (SELECT COUNT(*) FROM dbc_spell_categories WHERE dataset_id = $1)::INT AS categories_count,
    (SELECT COUNT(*) FROM dbc_spell_radii WHERE dataset_id = $1)::INT AS radii_count,
    (SELECT COUNT(*) FROM dbc_spell_focus_objects WHERE dataset_id = $1)::INT AS focus_objects_count,
    (SELECT COUNT(*) FROM dbc_extra_attack_spells WHERE dataset_id = $1)::INT AS extra_attacks_count,
    (SELECT COUNT(*) FROM dbc_duration_modifiers WHERE dataset_id = $1)::INT AS duration_modifiers_count,
    (SELECT COUNT(*) FROM dbc_periodic_spells WHERE dataset_id = $1)::INT AS periodic_spells_count,
    (SELECT COUNT(*) FROM dbc_vulnerability_spells WHERE dataset_id = $1)::INT AS vulnerability_spells_count,
    (SELECT COUNT(*) FROM dbc_cooldown_spells WHERE dataset_id = $1)::INT AS cooldowns_count,
    (SELECT COUNT(*) FROM dbc_spell_description_variables WHERE dataset_id = $1)::INT AS desc_variables_count,
    (SELECT COUNT(*) FROM dbc_affected_aura_durations WHERE dataset_id = $1)::INT AS affected_aura_durations_count,
    (SELECT COUNT(*) FROM dbc_consumables WHERE dataset_id = $1)::INT AS consumables_count,
    (SELECT EXISTS(SELECT 1 FROM dataset_talent_trees tt WHERE tt.dataset_id = $1))::BOOL AS has_talents;

-- name: ListDatasetImportCounts :many
-- Returns imported row counts for every dataset in one request. Each source
-- table is scanned once, avoiding the dataset page's previous N+1 count queries.
SELECT * FROM (
    SELECT dataset_id, 'spells_count'::TEXT AS data_type, COUNT(*)::INT AS data_count FROM dbc_spells GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'creatures_count', COUNT(*)::INT FROM world_creature_template GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'items_count', COUNT(*)::INT FROM world_item_template GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'item_display_count', COUNT(*)::INT FROM dbc_item_display_info GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'enchantments_count', COUNT(*)::INT FROM dbc_spell_item_enchantment GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'random_properties_count', COUNT(*)::INT FROM dbc_item_random_properties GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'item_sets_count', COUNT(*)::INT FROM dbc_item_set GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'cast_times_count', COUNT(*)::INT FROM dbc_spell_cast_times GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'durations_count', COUNT(*)::INT FROM dbc_spell_durations GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'ranges_count', COUNT(*)::INT FROM dbc_spell_ranges GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'icons_count', COUNT(*)::INT FROM dbc_spell_icons GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'categories_count', COUNT(*)::INT FROM dbc_spell_categories GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'radii_count', COUNT(*)::INT FROM dbc_spell_radii GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'focus_objects_count', COUNT(*)::INT FROM dbc_spell_focus_objects GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'extra_attacks_count', COUNT(*)::INT FROM dbc_extra_attack_spells GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'duration_modifiers_count', COUNT(*)::INT FROM dbc_duration_modifiers GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'periodic_spells_count', COUNT(*)::INT FROM dbc_periodic_spells GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'vulnerability_spells_count', COUNT(*)::INT FROM dbc_vulnerability_spells GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'cooldowns_count', COUNT(*)::INT FROM dbc_cooldown_spells GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'desc_variables_count', COUNT(*)::INT FROM dbc_spell_description_variables GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'affected_aura_durations_count', COUNT(*)::INT FROM dbc_affected_aura_durations GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'consumables_count', COUNT(*)::INT FROM dbc_consumables GROUP BY dataset_id
    UNION ALL
    SELECT dataset_id, 'has_talents', COUNT(*)::INT FROM dataset_talent_trees GROUP BY dataset_id
) AS import_counts
ORDER BY dataset_id, data_type;

