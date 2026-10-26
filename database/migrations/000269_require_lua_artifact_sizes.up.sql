BEGIN;

ALTER TABLE lua_project_artifacts ALTER COLUMN uncompressed_size_bytes SET NOT NULL;
ALTER TABLE lua_project_artifacts ALTER COLUMN stored_size_bytes SET NOT NULL;

COMMIT;
