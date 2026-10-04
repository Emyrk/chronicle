-- name: GetDatasetClassBuffs :one
SELECT data FROM dataset_class_buffs WHERE dataset_id = $1;

-- name: UpsertDatasetClassBuffs :exec
INSERT INTO dataset_class_buffs (dataset_id, data, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (dataset_id) DO UPDATE SET data = $2, updated_at = now();
