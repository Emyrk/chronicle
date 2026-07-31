BEGIN;

DROP INDEX IF EXISTS instance_speedruns_cohort_lookup_idx;

DROP TABLE IF EXISTS instance_overview_metrics;

COMMIT;
