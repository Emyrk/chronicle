BEGIN;

-- New uploads live in private object storage; old bytea rows remain readable
-- until migrated. No existing artifact rows are rewritten at startup.
ALTER TABLE lua_project_artifacts ALTER COLUMN bytes DROP NOT NULL;
ALTER TABLE lua_project_artifacts ADD COLUMN object_key TEXT;
ALTER TABLE lua_project_artifacts ADD CONSTRAINT lua_project_artifact_payload CHECK ((bytes IS NULL) <> (object_key IS NULL)) NOT VALID;

-- Durable tombstones let S3 deletion be retried after database commits/crashes.
CREATE TABLE lua_project_artifact_gc (
    object_key TEXT PRIMARY KEY,
    attempted_at TIMESTAMPTZ
);

COMMIT;
