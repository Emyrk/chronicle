-- name: ListClassBuffIgnoresForDataset :many
SELECT normalized_name
FROM class_buff_ignores
WHERE dataset_id = @dataset_id
ORDER BY normalized_name;

-- name: ListClassBuffIgnorePolicies :many
SELECT dataset_id, normalized_name, spell_name
FROM class_buff_ignores
ORDER BY normalized_name, dataset_id;

-- name: UpsertClassBuffIgnore :exec
INSERT INTO class_buff_ignores (dataset_id, normalized_name, spell_name, updated_at)
VALUES (@dataset_id, lower(btrim(@spell_name::TEXT)), btrim(@spell_name::TEXT), now())
ON CONFLICT (dataset_id, normalized_name) DO UPDATE SET
    spell_name = EXCLUDED.spell_name,
    updated_at = now();

-- name: DeleteClassBuffIgnore :exec
DELETE FROM class_buff_ignores
WHERE dataset_id = @dataset_id
  AND normalized_name = lower(btrim(@spell_name::TEXT));
