-- Capture the old mapping before a canonical run changes or disappears, and
-- the new mapping after reconciliation. Calls share the source transaction.
-- Repeated markings coalesce under one key without dropping a concurrent edit.
-- name: MarkDirtyObservationRunsByIDs :exec
INSERT INTO rating_dirty_observation_runs (tenant_id, run_id)
SELECT DISTINCT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), rr.run_id
FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE rr.run_id = ANY(@run_ids::uuid[]) AND cardinality(@run_ids::uuid[]) <= 200
ON CONFLICT (tenant_id, run_id) DO UPDATE
SET revision = rating_dirty_observation_runs.revision + 1, changed_at = now();

-- Locked parse scores can change after canonicalization without changing
-- ranking_runs. Mark only the actual run for the scoring source and tenant.
-- name: MarkDirtyObservationRunForInstance :exec
INSERT INTO rating_dirty_observation_runs (tenant_id, run_id)
SELECT DISTINCT @tenant_id::uuid, rr.run_id
FROM log_instances instance
JOIN ranking_runs rr ON rr.run_id = COALESCE(instance.duplicate_group_id, instance.id)
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE instance.id = @instance_id
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (tenant_id, run_id) DO UPDATE
SET revision = rating_dirty_observation_runs.revision + 1, changed_at = now();

-- name: ListDirtyObservationRunTenants :many
SELECT DISTINCT tenant_id FROM rating_dirty_observation_runs ORDER BY tenant_id;

-- name: LockDirtyObservationRuns :many
SELECT tenant_id, run_id, revision FROM rating_dirty_observation_runs
WHERE tenant_id = @tenant_id
ORDER BY changed_at, run_id
LIMIT LEAST(GREATEST(@batch_size::int, 0), 200)
FOR UPDATE SKIP LOCKED;

-- name: DeleteDirtyObservationRunIfRevision :execrows
DELETE FROM rating_dirty_observation_runs
WHERE tenant_id = @tenant_id AND run_id = @run_id AND revision = @revision;
