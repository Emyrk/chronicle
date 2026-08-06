-- name: GetItemTemplateByEntry :one
SELECT * FROM world_item_template WHERE dataset_id = @dataset_id AND entry = @entry;

-- name: GetDisplayInfoByID :one
SELECT * FROM world_display_info WHERE dataset_id = @dataset_id AND id = @id;
-- name: GetDBCItemDisplayInfoByID :one
SELECT * FROM dbc_item_display_info WHERE dataset_id = @dataset_id AND id = @id;

-- name: GetItemRandomPropertiesByID :one
SELECT * FROM dbc_item_random_properties WHERE dataset_id = @dataset_id AND id = @id;

-- name: GetSpellItemEnchantmentByID :one
SELECT * FROM dbc_spell_item_enchantment WHERE dataset_id = @dataset_id AND id = @id;

-- name: SearchSpellItemEnchantments :many
-- Name search for the gear builder's enchant picker. Same names appear at
-- multiple ranks/IDs, so the ID is part of the result identity.
SELECT id, name_lang
FROM dbc_spell_item_enchantment
WHERE dataset_id = @dataset_id
  AND name_lang ILIKE '%' || @search_term::text || '%'
ORDER BY name_lang, id
LIMIT 25;

-- name: GetItemSetByID :one
SELECT * FROM dbc_item_set WHERE dataset_id = @dataset_id AND id = @id;

-- name: GetItemSetBonuses :many
SELECT * FROM dbc_item_set_bonus WHERE dataset_id = @dataset_id AND set_id = @set_id ORDER BY threshold;
-- name: GetItemSetItems :many
SELECT * FROM dbc_item_set_item WHERE dataset_id = @dataset_id AND set_id = @set_id ORDER BY item_entry;

-- name: GetItemTemplatesBySetID :many
SELECT entry, name, inventory_type FROM world_item_template WHERE dataset_id = @dataset_id AND set_id = @set_id ORDER BY inventory_type;

-- name: GetItemTemplateMetadataBatch :many
-- Looks up items by ID. For items not found by ID (e.g. transmog IDs),
-- falls back to name lookup but only if the name is unique in the table.
-- Pass paired arrays where item_ids[i] corresponds to item_names[i].
WITH by_id AS (
  SELECT wit.entry, wit.name, wit.quality, wit.display_id, wit.item_level
  FROM world_item_template wit
  WHERE wit.dataset_id = @dataset_id AND wit.entry = ANY(@item_ids::int[])
),
by_name AS (
  SELECT wit.entry, wit.name, wit.quality, wit.display_id, wit.item_level
  FROM world_item_template wit
  WHERE wit.dataset_id = @dataset_id
    AND wit.name = ANY(@item_names::text[])
    AND wit.entry != ALL(@item_ids::int[])
    AND (SELECT COUNT(*) FROM world_item_template t2 WHERE t2.dataset_id = @dataset_id AND t2.name = wit.name) = 1
),
combined AS (
  SELECT * FROM by_id UNION ALL SELECT * FROM by_name
)
SELECT
  c.entry,
  c.name,
  c.quality,
  c.item_level,
  COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '') :: TEXT as icon
FROM combined c
  LEFT JOIN world_display_info wdi ON wdi.dataset_id = @dataset_id AND wdi.id = c.display_id
  LEFT JOIN dbc_item_display_info dbi ON dbi.dataset_id = @dataset_id AND dbi.id = c.display_id;

-- name: GetItemTemplatesByEntries :many
SELECT * FROM world_item_template WHERE dataset_id = @dataset_id AND entry = ANY(@entries::int[]);

-- name: GetCreatureTemplatesByEntries :many
SELECT * FROM world_creature_template WHERE dataset_id = @dataset_id AND entry = ANY(@entries::int[]);

-- name: SearchItemTemplates :many
SELECT
  wit.entry, wit.name, wit.quality, wit.inventory_type,
  wit.class, wit.subclass, wit.item_level, wit.required_level,
  wit.delay, wit.dmg_min1, wit.dmg_max1,
  wit.container_slots, wit.required_skill, wit.required_skill_rank,
  wit.armor,
  COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '') :: TEXT as icon
FROM world_item_template wit
  LEFT JOIN world_display_info wdi ON wdi.dataset_id = @dataset_id AND wdi.id = wit.display_id
  LEFT JOIN dbc_item_display_info dbi ON dbi.dataset_id = @dataset_id AND dbi.id = wit.display_id
WHERE wit.dataset_id = @dataset_id
  AND wit.name ILIKE '%' || @search_term::text || '%'
  AND (array_length(@qualities::int[], 1) IS NULL OR wit.quality = ANY(@qualities))
  AND (array_length(@inventory_types::int[], 1) IS NULL OR wit.inventory_type = ANY(@inventory_types))
  AND (array_length(@item_classes::int[], 1) IS NULL OR wit.class = ANY(@item_classes))
ORDER BY
  CASE WHEN @quality_desc::bool THEN wit.quality END DESC,
  CASE WHEN @item_level_desc::bool THEN wit.item_level END DESC,
  CASE WHEN @item_level_asc::bool THEN wit.item_level END ASC,
  CASE WHEN @required_level_desc::bool THEN wit.required_level END DESC,
  CASE WHEN @required_level_asc::bool THEN wit.required_level END ASC,
  wit.name ASC
LIMIT 25;

-- name: SearchCreatureTemplates :many
SELECT entry, name, subname, level_min, level_max,
  health_min, health_max, mana_min, mana_max,
  armor, dmg_min, dmg_max, unit_class
FROM world_creature_template
WHERE dataset_id = @dataset_id
  AND name ILIKE '%' || @search_term::text || '%'
  AND (@unit_class::int = -1 OR unit_class = @unit_class)
ORDER BY
  CASE WHEN @level_desc::bool THEN level_max END DESC,
  CASE WHEN @level_asc::bool THEN level_max END ASC,
  CASE WHEN @health_desc::bool THEN health_max END DESC,
  CASE WHEN @health_asc::bool THEN health_max END ASC,
  name ASC
LIMIT 25;

-- name: SearchItemSets :many
SELECT s.id, s.name_lang, s.required_skill, s.required_skill_rank,
  (SELECT COUNT(*) FROM dbc_item_set_item i WHERE i.dataset_id = @dataset_id AND i.set_id = s.id)::int AS piece_count,
  (SELECT COUNT(*) FROM dbc_item_set_bonus b WHERE b.dataset_id = @dataset_id AND b.set_id = s.id)::int AS bonus_count,
  COALESCE((
    SELECT MAX(wit.quality) FROM dbc_item_set_item i
    JOIN world_item_template wit ON wit.dataset_id = @dataset_id AND wit.entry = i.item_entry
    WHERE i.dataset_id = @dataset_id AND i.set_id = s.id
  ), 0)::int AS max_quality,
  COALESCE((
    SELECT MIN(i.item_entry) FROM dbc_item_set_item i WHERE i.dataset_id = @dataset_id AND i.set_id = s.id
  ), 0)::int AS first_item_entry
FROM dbc_item_set s
WHERE s.dataset_id = @dataset_id
  AND s.name_lang ILIKE '%' || @search_term::text || '%'
ORDER BY s.name_lang ASC
LIMIT 25;

-- name: GetItemSetWithPieces :many
-- Returns set pieces with item details for a specific set.
SELECT
  wit.entry, wit.name, wit.quality, wit.inventory_type,
  COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '') :: TEXT as icon
FROM dbc_item_set_item isi
  JOIN world_item_template wit ON wit.dataset_id = @dataset_id AND wit.entry = isi.item_entry
  LEFT JOIN world_display_info wdi ON wdi.dataset_id = @dataset_id AND wdi.id = wit.display_id
  LEFT JOIN dbc_item_display_info dbi ON dbi.dataset_id = @dataset_id AND dbi.id = wit.display_id
WHERE isi.dataset_id = @dataset_id AND isi.set_id = @set_id::int
ORDER BY wit.inventory_type;

