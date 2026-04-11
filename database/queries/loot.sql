-- name: InsertInstanceLoot :batchexec
INSERT INTO instance_loot (
    instance_id, realm_id,
    source_guid, source_ts,
    received_guid, received_ts,
    item_id, item_name, loot_suffix, quantity
)
SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
WHERE NOT EXISTS (
    SELECT 1 FROM world_item_template wit
    WHERE wit.entry = $7 AND wit.quality <= 1
);

-- name: GetInstanceLoot :many
SELECT
  il.*,
  COALESCE(wit.quality, 0)::INT as quality,
  COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '')::TEXT as icon
FROM instance_loot il
  LEFT JOIN world_item_template wit ON wit.entry = il.item_id
  LEFT JOIN world_display_info wdi ON wdi.id = wit.display_id
  LEFT JOIN dbc_item_display_info dbi ON wit.display_id = dbi.id
WHERE il.instance_id = $1
ORDER BY il.source_ts;

