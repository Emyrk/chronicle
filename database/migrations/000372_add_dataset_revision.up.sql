BEGIN;

-- Revisions are globally monotonic rather than scoped to a dataset UUID. This
-- prevents deleting and recreating the same UUID from reusing an old revision.
CREATE SEQUENCE datasets_revision_seq AS BIGINT START WITH 2;

-- PostgreSQL installs the constant default as table metadata for existing rows;
-- it does not rewrite or backfill the datasets table. Existing datasets begin
-- at revision 1, while future inserts and all mutations consume the sequence.
ALTER TABLE datasets
    ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE datasets
    ALTER COLUMN revision SET DEFAULT nextval('datasets_revision_seq');

COMMIT;
