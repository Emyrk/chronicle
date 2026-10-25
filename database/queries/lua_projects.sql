-- name: CreateLuaProject :one
INSERT INTO lua_projects (owner_id, kind, name, slug) VALUES (@owner_id, @kind, @name, @slug) RETURNING *;

-- name: ListOwnerLuaProjects :many
SELECT * FROM lua_projects WHERE owner_id = @owner_id ORDER BY updated_at DESC LIMIT 100;

-- name: GetOwnerLuaProject :one
SELECT * FROM lua_projects WHERE id = @id AND (owner_id = @owner_id OR @technical_admin::boolean);

-- name: ListPublicLuaProjects :many
SELECT * FROM lua_projects WHERE stable_hash IS NOT NULL ORDER BY stable_published_at DESC LIMIT 100;

-- name: GetPublicLuaProject :one
SELECT * FROM lua_projects WHERE id = @id AND (stable_hash IS NOT NULL OR unstable_hash IS NOT NULL);

-- name: SetLuaProjectDraft :one
UPDATE lua_projects SET draft_hash = @hash, revision = revision + 1, updated_at = now()
WHERE id = @id AND (owner_id = @owner_id OR @technical_admin::boolean) AND revision = @expected_revision RETURNING *;

-- name: PutLuaProjectArtifact :one
INSERT INTO lua_project_artifacts (project_id, hash, object_key) VALUES (@project_id, @hash, @object_key)
ON CONFLICT (project_id, hash) DO UPDATE SET hash = EXCLUDED.hash
RETURNING object_key;

-- name: PublishLuaProjectUnstable :one
UPDATE lua_projects SET unstable_hash = draft_hash, unstable_published_at = now(), unstable_published_by = @owner_id,
 revision = revision + 1, updated_at = now()
WHERE id = @id AND (owner_id = @owner_id OR @technical_admin::boolean) AND kind = 'panel' AND revision = @expected_revision AND draft_hash IS NOT NULL
RETURNING *;

-- name: PromoteLuaProjectStable :one
UPDATE lua_projects SET stable_hash = unstable_hash, stable_published_at = now(), stable_published_by = @owner_id,
 revision = revision + 1, updated_at = now()
WHERE id = @id AND (owner_id = @owner_id OR @technical_admin::boolean) AND kind = 'panel' AND revision = @expected_revision
 AND unstable_hash = @tested_sha256 AND unstable_hash IS NOT NULL
RETURNING *;

-- name: PruneLuaProjectArtifacts :exec
WITH removed AS (
  DELETE FROM lua_project_artifacts a USING lua_projects p
  WHERE a.project_id = p.id AND p.id = @id AND (p.owner_id = @owner_id OR @technical_admin::boolean)
   AND a.hash IS DISTINCT FROM p.draft_hash AND a.hash IS DISTINCT FROM p.unstable_hash
   AND a.hash IS DISTINCT FROM p.stable_hash
  RETURNING a.object_key
)
INSERT INTO lua_project_artifact_gc (object_key)
SELECT object_key FROM removed WHERE object_key IS NOT NULL
ON CONFLICT DO NOTHING;

-- name: RegisterLuaProjectUpload :exec
INSERT INTO lua_project_artifact_gc (object_key, ready_at)
VALUES (@object_key, now() + interval '10 minutes');

-- name: ConsumeLuaProjectUpload :one
DELETE FROM lua_project_artifact_gc
WHERE object_key = @object_key AND attempted_at IS NULL AND ready_at > now()
RETURNING object_key;

-- name: ClaimLuaProjectArtifactGarbage :many
WITH candidates AS (
  SELECT gc.object_key FROM lua_project_artifact_gc gc
  WHERE gc.ready_at <= @as_of::timestamptz AND (gc.attempted_at IS NULL OR gc.attempted_at + interval '2 minutes' < @as_of::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM lua_project_artifacts a WHERE a.object_key = gc.object_key)
  ORDER BY gc.attempted_at NULLS FIRST, gc.object_key LIMIT 50 FOR UPDATE SKIP LOCKED
)
UPDATE lua_project_artifact_gc gc SET attempted_at = @as_of::timestamptz
FROM candidates c WHERE gc.object_key = c.object_key
RETURNING gc.object_key;

-- name: ListLuaProjectArtifactGarbage :many
SELECT object_key FROM lua_project_artifact_gc ORDER BY object_key LIMIT 100;

-- name: DeleteLuaProjectArtifactGarbage :exec
DELETE FROM lua_project_artifact_gc WHERE object_key = @object_key;

-- name: GetOwnerLuaProjectDraftPackage :one
SELECT sqlc.embed(p), a.bytes, a.object_key
FROM lua_projects p
JOIN lua_project_artifacts a ON a.project_id = p.id AND a.hash = p.draft_hash
WHERE p.id = @id AND (p.owner_id = @owner_id OR @technical_admin::boolean);

-- name: GetPublishedLuaProjectPackage :one
SELECT sqlc.embed(p), a.bytes, a.object_key
FROM lua_projects p
JOIN lua_project_artifacts a ON a.project_id = p.id
 AND a.hash = CASE WHEN @channel::text = 'stable' THEN p.stable_hash ELSE p.unstable_hash END
WHERE p.id = @id AND @channel::text IN ('stable', 'unstable');

-- name: GetLuaProjectArtifact :one
SELECT object_key FROM lua_project_artifacts WHERE project_id = @project_id AND hash = @hash;
