BEGIN;
-- A full rebuild can publish while a dirty cohort is between pages. Resume
-- only in the generation for which the cursor was originally computed.
ALTER TABLE rating_peak_cohort_pages ADD COLUMN generation_id UUID;
COMMIT;
