BEGIN;

ALTER TABLE lua_project_artifact_gc DROP COLUMN ready_at;

COMMIT;
