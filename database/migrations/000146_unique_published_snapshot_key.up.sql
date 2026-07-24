BEGIN;

-- Enforce at most one published snapshot per logical key. The worker has an
-- application-level already-published check, but concurrent replicas (hourly
-- dispatch on one instance racing an admin backfill on another) could both
-- pass it; this index makes the publish step fail-safe. Pending snapshots are
-- not constrained (failed attempts may accumulate and are harmless).
CREATE UNIQUE INDEX ranking_snapshots_published_key_idx
    ON ranking_snapshots (tenant_id, cutoff, lookback_days, cohort_mode, policy_version, query_version)
    WHERE status = 'published';

COMMIT;
