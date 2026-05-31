-- name: GetDatasetTalentTrees :one
SELECT data FROM dataset_talent_trees WHERE dataset_id = $1;

-- name: UpsertDatasetTalentTrees :exec
INSERT INTO dataset_talent_trees (dataset_id, data, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (dataset_id) DO UPDATE SET data = $2, updated_at = now();

-- name: DeleteDatasetTalentTrees :exec
DELETE FROM dataset_talent_trees WHERE dataset_id = $1;
