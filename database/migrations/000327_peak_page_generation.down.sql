BEGIN;
ALTER TABLE rating_peak_cohort_pages DROP COLUMN generation_id;
COMMIT;
