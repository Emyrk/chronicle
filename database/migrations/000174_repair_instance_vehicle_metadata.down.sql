BEGIN;

-- This migration repairs databases that skipped migration 000172. The column
-- remains owned by 000172 on databases where the original migration ran, so
-- rolling back this repair must not remove it.

COMMIT;
