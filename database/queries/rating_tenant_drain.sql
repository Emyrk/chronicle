-- One recovery dispatch covers every durable rating intent. UNION removes
-- duplicate tenant IDs without requiring four separate River dispatch jobs.
-- name: ListDirtyTenantRatings :many
SELECT tenant_id FROM rating_dirty_observation_runs
UNION
SELECT tenant_id FROM rating_dirty_renown_subjects
UNION
SELECT tenant_id FROM rating_dirty_mastery_subjects
UNION
SELECT tenant_id FROM rating_dirty_peak_cohorts
ORDER BY tenant_id;
