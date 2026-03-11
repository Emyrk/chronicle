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

-- name: GetItemTemplatesBySetID :many
SELECT entry, name, inventory_type FROM world_item_template WHERE set_id = $1 ORDER BY inventory_type;
