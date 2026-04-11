-- name: InsertInstanceLoot :batchexec
INSERT INTO instance_loot (
    instance_id, realm_id,
    source_guid, source_ts,
    received_guid, received_ts,
    item_id, item_name, loot_suffix, quantity
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);

-- name: GetInstanceLoot :many
SELECT * FROM instance_loot WHERE instance_id = $1 ORDER BY source_ts;

