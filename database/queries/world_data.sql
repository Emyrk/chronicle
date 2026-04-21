-- name: GetItemTemplateByEntry :one
SELECT * FROM world_item_template WHERE entry = $1;

-- name: GetDisplayInfoByID :one
SELECT * FROM world_display_info WHERE id = $1;
-- name: GetDBCItemDisplayInfoByID :one
SELECT * FROM dbc_item_display_info WHERE id = $1;


-- name: GetItemRandomPropertiesByID :one
SELECT * FROM dbc_item_random_properties WHERE id = $1;

-- name: GetSpellItemEnchantmentByID :one
SELECT * FROM dbc_spell_item_enchantment WHERE id = $1;

-- name: GetItemSetByID :one
SELECT * FROM dbc_item_set WHERE id = $1;

-- name: GetItemSetBonuses :many
SELECT * FROM dbc_item_set_bonus WHERE set_id = $1 ORDER BY threshold;
-- name: GetItemSetItems :many
SELECT * FROM dbc_item_set_item WHERE set_id = $1 ORDER BY item_entry;


-- name: GetItemTemplatesBySetID :many
SELECT entry, name, inventory_type FROM world_item_template WHERE set_id = $1 ORDER BY inventory_type;

-- name: GetItemTemplateMetadataBatch :many
-- Looks up items by ID. For items not found by ID (e.g. transmog IDs),
-- falls back to name lookup but only if the name is unique in the table.
-- Pass paired arrays where item_ids[i] corresponds to item_names[i].
WITH by_id AS (
  SELECT wit.entry, wit.name, wit.quality, wit.display_id
  FROM world_item_template wit
  WHERE wit.entry = ANY(@item_ids::int[])
),
by_name AS (
  SELECT wit.entry, wit.name, wit.quality, wit.display_id
  FROM world_item_template wit
  WHERE wit.name = ANY(@item_names::text[])
    AND wit.entry != ALL(@item_ids::int[])
    AND (SELECT COUNT(*) FROM world_item_template t2 WHERE t2.name = wit.name) = 1
),
combined AS (
  SELECT * FROM by_id UNION ALL SELECT * FROM by_name
)
SELECT
  c.entry,
  c.name,
  c.quality,
  COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '') :: TEXT as icon
FROM combined c
  LEFT JOIN world_display_info wdi ON wdi.id = c.display_id
  LEFT JOIN dbc_item_display_info dbi ON c.display_id = dbi.id;

-- name: GetItemTemplatesByEntries :many
SELECT * FROM world_item_template WHERE entry = ANY(@entries::int[]);

-- name: GetCreatureTemplatesByEntries :many
SELECT * FROM world_creature_template WHERE entry = ANY(@entries::int[]);

