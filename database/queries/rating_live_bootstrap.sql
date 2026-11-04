-- Existing tenants must establish complete canonical history before any
-- incremental Mastery or Peak projection writes. Pages and cursor commit in
-- one transaction; concurrent source mutations carry their own dirty run.
-- name: StartRatingLiveEvidenceBootstrap :exec
INSERT INTO rating_live_evidence_bootstraps (tenant_id, source_cutoff)
VALUES (@tenant_id, @source_cutoff::timestamptz)
ON CONFLICT (tenant_id) DO NOTHING;

-- name: LockRatingLiveEvidenceBootstrap :one
SELECT tenant_id, after_run_id, source_cutoff, completed_at
FROM rating_live_evidence_bootstraps
WHERE tenant_id = @tenant_id FOR UPDATE;

-- name: AdvanceRatingLiveEvidenceBootstrap :execrows
UPDATE rating_live_evidence_bootstraps SET after_run_id = @after_run_id
WHERE tenant_id = @tenant_id AND completed_at IS NULL AND after_run_id = @expected_run_id;

-- name: CompleteRatingLiveEvidenceBootstrap :execrows
UPDATE rating_live_evidence_bootstraps AS bootstrap SET completed_at = now()
WHERE bootstrap.tenant_id = @tenant_id AND bootstrap.completed_at IS NULL
  AND bootstrap.after_run_id = @expected_run_id
  AND NOT EXISTS (SELECT 1 FROM rating_dirty_observation_runs dirty
                  WHERE dirty.tenant_id = bootstrap.tenant_id);

-- name: TenantLiveEvidenceReady :one
SELECT EXISTS (SELECT 1 FROM rating_live_evidence_bootstraps
               WHERE tenant_id = @tenant_id AND completed_at IS NOT NULL);

-- name: ListRatingLiveBootstrapRunPage :many
SELECT rr.run_id FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
WHERE server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND rr.run_id > @after_run_id AND rr.updated_at <= @source_cutoff::timestamptz
  AND rr.source_updated_at <= @source_cutoff::timestamptz
ORDER BY rr.run_id LIMIT LEAST(GREATEST(@batch_size::int, 0), 200);
