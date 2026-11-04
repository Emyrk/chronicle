-- One bounded row per tenant with realms. Aggregate each dirty table once rather
-- than running four correlated count(*) scans per tenant on every admin poll.
-- name: ListTenantRatingCatchupStatus :many
WITH tenants AS (
    SELECT DISTINCT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id
    FROM wow_servers server JOIN wow_server_realms realm ON realm.server_id = server.id
), dirty_runs AS (
    SELECT tenant_id, count(*)::bigint AS total, min(changed_at) AS oldest
    FROM rating_dirty_observation_runs GROUP BY tenant_id
), dirty_renown AS (
    SELECT tenant_id, count(*)::bigint AS total, min(changed_at) AS oldest
    FROM rating_dirty_renown_subjects GROUP BY tenant_id
), dirty_mastery AS (
    SELECT tenant_id, count(*)::bigint AS total, min(changed_at) AS oldest
    FROM rating_dirty_mastery_subjects GROUP BY tenant_id
), dirty_peak AS (
    SELECT tenant_id, count(*)::bigint AS total, min(changed_at) AS oldest
    FROM rating_dirty_peak_cohorts GROUP BY tenant_id
), peak_pages AS (
    SELECT tenant_id, count(*)::bigint AS total
    FROM rating_peak_cohort_pages_evolving GROUP BY tenant_id
), policy_scan AS (
    SELECT tenant_id, count(*)::bigint AS unfinished_stages
    FROM rating_policy_scan_progress WHERE NOT completed GROUP BY tenant_id
), active_jobs AS (
    SELECT (args->>'tenant_id')::uuid AS tenant_id, count(*)::bigint AS total
    FROM river_job
    WHERE kind = 'drain-tenant-ratings' AND state IN ('available', 'pending', 'retryable', 'running', 'scheduled')
    GROUP BY args->>'tenant_id'
)
SELECT tenants.tenant_id::uuid AS tenant_id,
       COALESCE(dirty_runs.total, 0)::bigint AS dirty_runs,
       dirty_runs.oldest::timestamptz AS oldest_run,
       COALESCE(dirty_renown.total, 0)::bigint AS dirty_renown,
       dirty_renown.oldest::timestamptz AS oldest_renown,
       COALESCE(dirty_mastery.total, 0)::bigint AS dirty_mastery,
       dirty_mastery.oldest::timestamptz AS oldest_mastery,
       COALESCE(dirty_peak.total, 0)::bigint AS dirty_peak,
       dirty_peak.oldest::timestamptz AS oldest_peak,
       COALESCE(peak_pages.total, 0)::bigint AS peak_pages,
       COALESCE(active_jobs.total, 0)::bigint AS active_drain_jobs,
       COALESCE(policy_scan.unfinished_stages, 0)::bigint AS unfinished_policy_scan_stages,
       bootstrap.after_run_id, bootstrap.source_cutoff, bootstrap.completed_at,
       COALESCE(read_state.state, CASE WHEN EXISTS (
           SELECT 1 FROM rating_score_generations g
           WHERE g.tenant_id = tenants.tenant_id AND g.status = 'active'
       ) THEN 'legacy' ELSE 'evolving' END)::text AS read_state
FROM tenants
LEFT JOIN dirty_runs USING (tenant_id)
LEFT JOIN dirty_renown USING (tenant_id)
LEFT JOIN dirty_mastery USING (tenant_id)
LEFT JOIN dirty_peak USING (tenant_id)
LEFT JOIN peak_pages USING (tenant_id)
LEFT JOIN rating_live_evidence_bootstraps bootstrap USING (tenant_id)
LEFT JOIN policy_scan USING (tenant_id)
LEFT JOIN active_jobs USING (tenant_id)
LEFT JOIN tenant_rating_read_states read_state USING (tenant_id)
ORDER BY tenants.tenant_id;

-- A bounded view of recent repair, copy, and scan attempts for the admin board.
-- Dirty keys and cursors remain authoritative when older jobs age out here.
-- name: ListRecentTenantRatingJobs :many
SELECT id, kind::text AS kind, COALESCE(args->>'tenant_id', '')::text AS tenant_id, state::text AS state,
       created_at, attempted_at, finalized_at,
       COALESCE(errors[array_length(errors, 1)]->>'error', '')::text AS last_error
FROM river_job
WHERE kind IN ('drain-tenant-ratings', 'copy-tenant-ratings', 'rating-policy-scan')
ORDER BY id DESC
LIMIT 2000;
