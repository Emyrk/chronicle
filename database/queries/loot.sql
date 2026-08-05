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

-- name: GetCharacterLoot :many
-- Loot received by one character, newest first. Duplicate uploads of the
-- same raid night are collapsed by (run, item, loot timestamp).
WITH deduped AS (
  SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, il.instance_id), il.item_id, il.received_ts)
    il.instance_id, il.received_ts, il.item_id, il.item_name, il.loot_suffix, il.quantity,
    li.name AS instance_name,
    li.hashed_slug AS instance_slug
  FROM instance_loot il
  JOIN log_instances li ON li.id = il.instance_id
  WHERE il.realm_id = @realm_id
    AND il.received_guid = @received_guid
  ORDER BY COALESCE(li.duplicate_group_id, il.instance_id), il.item_id, il.received_ts
)
SELECT
  d.*,
  COALESCE(wit.quality, 0)::INT as quality,
  COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '')::TEXT as icon
FROM deduped d
  LEFT JOIN world_item_template wit ON wit.dataset_id = @dataset_id AND wit.entry = d.item_id
  LEFT JOIN world_display_info wdi ON wdi.dataset_id = @dataset_id AND wdi.id = wit.display_id
  LEFT JOIN dbc_item_display_info dbi ON dbi.dataset_id = @dataset_id AND dbi.id = wit.display_id
ORDER BY d.received_ts DESC
LIMIT @result_limit;

-- name: GetInstanceLoot :many
SELECT
  il.*,
  COALESCE(wit.quality, 0)::INT as quality,
  COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '')::TEXT as icon
FROM instance_loot il
  LEFT JOIN world_item_template wit ON wit.dataset_id = @dataset_id AND wit.entry = il.item_id
  LEFT JOIN world_display_info wdi ON wdi.dataset_id = @dataset_id AND wdi.id = wit.display_id
  LEFT JOIN dbc_item_display_info dbi ON dbi.dataset_id = @dataset_id AND dbi.id = wit.display_id
WHERE il.instance_id = @instance_id
ORDER BY il.source_ts;

