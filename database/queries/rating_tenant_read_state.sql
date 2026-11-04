-- name: GetTenantRatingReadState :one
-- Missing rows are evolving only when there is no active published generation.
SELECT COALESCE((SELECT state FROM tenant_rating_read_states rs WHERE rs.tenant_id = sqlc.arg(tenant_id)::uuid),
  CASE WHEN EXISTS (SELECT 1 FROM rating_score_generations g
                    WHERE g.tenant_id = sqlc.arg(tenant_id)::uuid AND status = 'active')
       THEN 'legacy' ELSE 'evolving' END)::text AS state;

-- name: GetTenantRatingCatchupSummary :one
-- EXISTS uses the tenant indexes and avoids counting large dirty queues.
SELECT (COALESCE((SELECT state FROM tenant_rating_read_states WHERE tenant_id = @tenant_id::uuid),
    CASE WHEN EXISTS (SELECT 1 FROM rating_score_generations WHERE tenant_id = @tenant_id::uuid AND status = 'active')
         THEN 'legacy' ELSE 'evolving' END) = 'evolving'
  AND EXISTS (SELECT 1 FROM rating_live_evidence_bootstraps WHERE tenant_id = @tenant_id::uuid AND completed_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM rating_dirty_observation_runs WHERE tenant_id = @tenant_id::uuid)
  AND NOT EXISTS (SELECT 1 FROM rating_dirty_renown_subjects WHERE tenant_id = @tenant_id::uuid)
  AND NOT EXISTS (SELECT 1 FROM rating_dirty_mastery_subjects WHERE tenant_id = @tenant_id::uuid)
  AND NOT EXISTS (SELECT 1 FROM rating_dirty_peak_cohorts WHERE tenant_id = @tenant_id::uuid)
  AND NOT EXISTS (SELECT 1 FROM rating_peak_cohort_pages_evolving WHERE tenant_id = @tenant_id::uuid)) AS caught_up;

-- Held inside each evolving writer transaction. A copier's legacy→copying
-- update waits for in-flight pages, and pages beginning afterward cannot
-- acknowledge keys until the final copying→evolving commit.
-- name: LockTenantRatingReadStateForEvolvingPage :one
SELECT COALESCE((SELECT state FROM tenant_rating_read_states rs
                 WHERE rs.tenant_id = sqlc.arg(tenant_id)::uuid FOR SHARE),
  CASE WHEN EXISTS (SELECT 1 FROM rating_score_generations g
                    WHERE g.tenant_id = sqlc.arg(tenant_id)::uuid AND status = 'active')
       THEN 'legacy' ELSE 'evolving' END)::text AS state;
