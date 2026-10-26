BEGIN;

DROP TABLE lua_project_artifact_gc;
ALTER TABLE lua_project_artifacts DROP CONSTRAINT lua_project_artifact_payload;
-- Rollback requires migrating stored objects back into bytea first.
-- Refuse to silently discard ZIPs if S3-backed rows exist.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM lua_project_artifacts WHERE bytes IS NULL) THEN
        RAISE EXCEPTION 'migrate S3-backed Lua artifacts into PostgreSQL before rollback';
    END IF;
END $$;
ALTER TABLE lua_project_artifacts DROP COLUMN object_key;
ALTER TABLE lua_project_artifacts ALTER COLUMN bytes SET NOT NULL;

COMMIT;
