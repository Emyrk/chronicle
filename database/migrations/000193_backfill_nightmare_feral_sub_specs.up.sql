BEGIN;

-- Historical Cat/Bear classification is intentionally deferred. Production
-- tables are large enough that these updates should be run in supervised,
-- restartable batches rather than blocking application startup.

COMMIT;
