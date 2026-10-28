-- name: CreateLuaProject :one
INSERT INTO lua_projects (owner_id, kind, name, slug) VALUES (@owner_id, @kind, @name, @slug) RETURNING *;

-- name: ListUserLuaProjects :many
-- Projects the user owns or contributes to.
SELECT * FROM lua_projects
WHERE owner_id = @user_id OR id IN (SELECT project_id FROM lua_project_contributors WHERE user_id = @user_id)
ORDER BY updated_at DESC LIMIT 100;

-- name: GetLuaProject :one
-- Callers check the project permission in SpiceDB first.
SELECT * FROM lua_projects WHERE id = @id;

-- name: GetLuaProjectByAuthorSlug :one
SELECT p.* FROM lua_projects p JOIN addon_authors a ON a.user_id = p.owner_id
WHERE a.name = @author AND p.slug = @slug;

-- name: ListPublicLuaProjects :many
SELECT * FROM lua_projects WHERE stable_hash IS NOT NULL ORDER BY stable_published_at DESC LIMIT 100;

-- name: GetPublicLuaProject :one
SELECT * FROM lua_projects WHERE id = @id AND (stable_hash IS NOT NULL OR unstable_hash IS NOT NULL);

-- name: SetLuaProjectDraft :one
UPDATE lua_projects SET draft_hash = @hash, draft_icon = @icon, revision = revision + 1, updated_at = now()
WHERE id = @id AND revision = @expected_revision RETURNING *;

-- name: PutLuaProjectArtifact :one
INSERT INTO lua_project_artifacts (project_id, hash, object_key, mime_type, content_encoding, uncompressed_size_bytes, stored_size_bytes)
VALUES (@project_id, @hash, @object_key, @mime_type, @content_encoding, @uncompressed_size_bytes, @stored_size_bytes)
ON CONFLICT (project_id, hash) DO UPDATE SET hash = EXCLUDED.hash
RETURNING object_key;

-- name: PublishLuaProjectUnstable :one
UPDATE lua_projects SET unstable_hash = draft_hash, unstable_icon = draft_icon, unstable_published_at = now(), unstable_published_by = @actor_id,
 revision = revision + 1, updated_at = now()
WHERE id = @id AND kind = 'panel' AND revision = @expected_revision AND draft_hash IS NOT NULL
RETURNING *;

-- name: PromoteLuaProjectStable :one
UPDATE lua_projects SET stable_hash = unstable_hash, stable_icon = unstable_icon, stable_published_at = now(), stable_published_by = @actor_id,
 revision = revision + 1, updated_at = now()
WHERE id = @id AND kind = 'panel' AND revision = @expected_revision
 AND unstable_hash = @tested_sha256 AND unstable_hash IS NOT NULL
RETURNING *;

-- name: PruneLuaProjectArtifacts :exec
WITH removed AS (
  DELETE FROM lua_project_artifacts a USING lua_projects p
  WHERE a.project_id = p.id AND p.id = @id
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
  -- A null override uses PostgreSQL time. Tests supply an explicit cutoff to
  -- exercise grace periods and retries without sleeps.
  WHERE gc.ready_at <= COALESCE(@as_of::timestamptz, now())
    AND (gc.attempted_at IS NULL OR gc.attempted_at + interval '2 minutes' < COALESCE(@as_of::timestamptz, now()))
    AND NOT EXISTS (SELECT 1 FROM lua_project_artifacts a WHERE a.object_key = gc.object_key)
  ORDER BY gc.attempted_at NULLS FIRST, gc.object_key LIMIT 50 FOR UPDATE SKIP LOCKED
)
UPDATE lua_project_artifact_gc gc SET attempted_at = COALESCE(@as_of::timestamptz, now())
FROM candidates c WHERE gc.object_key = c.object_key
RETURNING gc.object_key;

-- name: CountReadyLuaProjectArtifactGarbage :one
SELECT count(*) FROM lua_project_artifact_gc gc
WHERE gc.ready_at <= now()
  AND NOT EXISTS (SELECT 1 FROM lua_project_artifacts a WHERE a.object_key = gc.object_key);

-- name: ListLuaProjectArtifactGarbage :many
SELECT object_key FROM lua_project_artifact_gc ORDER BY object_key LIMIT 100;

-- name: DeleteLuaProjectArtifactGarbage :exec
DELETE FROM lua_project_artifact_gc WHERE object_key = @object_key;

-- name: GetLuaProjectDraftPackage :one
SELECT sqlc.embed(p), a.object_key, a.mime_type, a.content_encoding
FROM lua_projects p
JOIN lua_project_artifacts a ON a.project_id = p.id AND a.hash = p.draft_hash
WHERE p.id = @id;

-- name: GetPublishedLuaProjectArtifact :one
SELECT sqlc.embed(p), a.object_key, a.mime_type, a.content_encoding
FROM lua_projects p
JOIN lua_project_artifacts a ON a.project_id = p.id AND a.hash = @hash
WHERE p.id = @id AND (p.stable_hash = @hash OR p.unstable_hash = @hash);

-- name: GetLuaProjectArtifact :one
SELECT object_key, mime_type, content_encoding, uncompressed_size_bytes, stored_size_bytes
FROM lua_project_artifacts WHERE project_id = @project_id AND hash = @hash;

-- name: GetAddonAuthorByUser :one
SELECT * FROM addon_authors WHERE user_id = @user_id;

-- name: GetAddonAuthorByName :one
SELECT * FROM addon_authors WHERE name = @name;

-- name: ListAddonAuthorsByUsers :many
SELECT * FROM addon_authors WHERE user_id = ANY(@user_ids::uuid[]);

-- name: InsertAddonAuthor :one
INSERT INTO addon_authors (user_id, name) VALUES (@user_id, @name) RETURNING *;

-- name: ListLuaProjectContributors :many
SELECT c.user_id, c.permissions, c.created_at, a.name AS author_name, u.username
FROM lua_project_contributors c
JOIN users u ON u.id = c.user_id
LEFT JOIN addon_authors a ON a.user_id = c.user_id
WHERE c.project_id = @project_id
ORDER BY c.created_at;

-- name: UpsertLuaProjectContributor :one
INSERT INTO lua_project_contributors (project_id, user_id, permissions, added_by)
VALUES (@project_id, @user_id, @permissions, @added_by)
ON CONFLICT (project_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = now()
RETURNING *;

-- name: DeleteLuaProjectContributor :execrows
DELETE FROM lua_project_contributors WHERE project_id = @project_id AND user_id = @user_id;
