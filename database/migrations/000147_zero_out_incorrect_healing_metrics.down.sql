BEGIN;

-- No-op: the zeroed values were incorrect (total instead of effective
-- healing) and cannot be restored. Reparse logs to repopulate.

COMMIT;
