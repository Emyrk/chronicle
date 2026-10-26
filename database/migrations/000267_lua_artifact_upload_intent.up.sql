BEGIN;

-- Record prospective object keys before upload. Existing prune tombstones stay
-- immediately eligible; uploads receive a grace period for object I/O.
ALTER TABLE lua_project_artifact_gc ADD COLUMN ready_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMIT;
