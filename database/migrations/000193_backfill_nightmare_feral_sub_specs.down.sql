BEGIN;

-- Data-only migration. The backfilled Cat value is indistinguishable from a
-- value written by a subsequent parse, so reverting it would risk deleting
-- valid cohort data.

COMMIT;
