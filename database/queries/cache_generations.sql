-- name: PublishCacheGeneration :one
WITH bumped AS (
    INSERT INTO cache_generations (namespace, scope, scope_id, generation)
    VALUES (@namespace, @scope, @scope_id, 1)
    ON CONFLICT (namespace, scope, scope_id)
    DO UPDATE SET generation = cache_generations.generation + 1
    RETURNING namespace, scope, scope_id, generation
)
SELECT namespace, scope, scope_id, generation,
       pg_notify('cache_invalidation', json_build_object(
           'namespace', namespace,
           'scope', scope,
           'scope_id', scope_id,
           'generation', generation
       )::text) AS notified
FROM bumped;

-- name: GetCacheGeneration :one
SELECT namespace, scope, scope_id, generation
FROM cache_generations
WHERE namespace = @namespace
  AND scope = @scope
  AND scope_id = @scope_id;

-- name: ListCacheGenerations :many
SELECT namespace, scope, scope_id, generation
FROM cache_generations
ORDER BY namespace, scope, scope_id;

-- name: DeleteDatasetCacheGenerations :exec
DELETE FROM cache_generations
WHERE scope = 'dataset' AND scope_id = @dataset_id;
