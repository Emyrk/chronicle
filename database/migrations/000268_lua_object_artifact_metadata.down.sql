BEGIN;

ALTER TABLE lua_project_artifacts DROP COLUMN stored_size_bytes;
ALTER TABLE lua_project_artifacts DROP COLUMN uncompressed_size_bytes;
ALTER TABLE lua_project_artifacts DROP COLUMN content_encoding;
ALTER TABLE lua_project_artifacts DROP COLUMN mime_type;
ALTER TABLE lua_project_artifacts ALTER COLUMN object_key DROP NOT NULL;
ALTER TABLE lua_project_artifacts ADD COLUMN bytes BYTEA;
ALTER TABLE lua_project_artifacts ADD CONSTRAINT lua_project_artifact_payload
    CHECK ((bytes IS NULL) <> (object_key IS NULL)) NOT VALID;

COMMIT;
