-- Serialize page workers for one generation and reject retired/active or
-- legacy group checkpoints before any projection writes. Configuration changes
-- remain fenced by the revision check in the same transaction.
-- name: GetBuildingTenantProjectionCheckpoint :one
SELECT cp.* FROM rating_rebuild_checkpoints cp
JOIN rating_score_generations gen ON gen.id = cp.generation_id
  AND gen.tenant_id = cp.tenant_id AND gen.status = 'building'
WHERE cp.tenant_id = @tenant_id AND cp.generation_id = @generation_id
  AND cp.manifest->>'writer' = 'tenant'
FOR UPDATE OF cp;
