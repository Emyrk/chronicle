BEGIN;

-- These project migrations have not shipped. Refuse to discard a locally
-- created bytea-only artifact rather than silently losing its package.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM lua_project_artifacts WHERE object_key IS NULL) THEN
    RAISE EXCEPTION 'Migrate bytea-only Lua artifacts before dropping bytes';
  END IF;
END $$;

ALTER TABLE lua_project_artifacts DROP CONSTRAINT lua_project_artifact_payload;
ALTER TABLE lua_project_artifacts DROP COLUMN bytes;
ALTER TABLE lua_project_artifacts ALTER COLUMN object_key SET NOT NULL;
ALTER TABLE lua_project_artifacts ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'application/zip';
-- NULL means the stored object is not wrapped in an additional encoding.
ALTER TABLE lua_project_artifacts ADD COLUMN content_encoding TEXT;
-- Nullable for pre-existing local object rows whose sizes were not recorded.
ALTER TABLE lua_project_artifacts ADD COLUMN uncompressed_size_bytes BIGINT CHECK (uncompressed_size_bytes >= 0);
ALTER TABLE lua_project_artifacts ADD COLUMN stored_size_bytes BIGINT CHECK (stored_size_bytes >= 0);

COMMIT;
