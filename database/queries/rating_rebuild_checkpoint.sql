-- The start function atomically locks the tenant revision, snapshots all config,
-- creates a building generation and checkpoint, or returns the unfinished one.
-- name: StartRatingRebuild :one
SELECT start_rating_rebuild(@tenant_id::uuid, @policy_version::int,
                            @as_of::timestamptz, @source_cutoff::timestamptz)::uuid;

-- name: GetRatingConfigRevision :one
SELECT revision FROM rating_config_revisions WHERE tenant_id = @tenant_id;

-- Invalidate checkpoints staged before a canonical run's facts were removed.
-- Caller supplies the affected realms in the same transaction as deletion.
-- The realm list is bounded by the canonical refresh page size.
-- name: BumpRatingConfigRevisionForRealms :execrows
INSERT INTO rating_config_revisions (tenant_id, revision)
SELECT DISTINCT COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 1
FROM wow_server_realms realm
JOIN wow_servers server ON server.id = realm.server_id
WHERE realm.id = ANY(@realm_ids::uuid[])
  AND cardinality(@realm_ids::uuid[]) BETWEEN 1 AND 100
ON CONFLICT (tenant_id) DO UPDATE
SET revision = rating_config_revisions.revision + 1;

-- name: GetRatingRebuildCheckpoint :one
SELECT * FROM rating_rebuild_checkpoints
WHERE tenant_id = @tenant_id AND generation_id = @generation_id;

-- name: GetBuildingRatingRebuildCheckpoint :one
SELECT cp.* FROM rating_rebuild_checkpoints cp
JOIN rating_score_generations gen ON gen.id = cp.generation_id
WHERE cp.tenant_id = @tenant_id AND gen.tenant_id = @tenant_id
  AND gen.status = 'building';

-- Caller owns phase-specific JSON cursor keys. CAS prevents stale workers from
-- overwriting another worker's progress. Do not advance before staging writes
-- commit; use the same transaction for inserts and this checkpoint update.
-- name: AdvanceRatingRebuildCheckpoint :execrows
UPDATE rating_rebuild_checkpoints cp
SET phase = @next_phase, cursor = @next_cursor::jsonb, heartbeat_at = now()
FROM rating_score_generations gen
WHERE cp.generation_id = @generation_id AND cp.tenant_id = @tenant_id
  AND gen.id = cp.generation_id AND gen.tenant_id = cp.tenant_id
  AND gen.status = 'building' AND cp.phase = @expected_phase
  AND cp.cursor = @expected_cursor::jsonb
  AND length(btrim(@next_phase::text)) > 0;

-- name: HeartbeatRatingRebuildCheckpoint :execrows
UPDATE rating_rebuild_checkpoints cp SET heartbeat_at = now()
FROM rating_score_generations gen
WHERE cp.generation_id = @generation_id AND cp.tenant_id = @tenant_id
  AND gen.id = cp.generation_id AND gen.status = 'building'
  AND cp.phase = @expected_phase AND cp.cursor = @expected_cursor::jsonb;

-- Publish is atomic and gates on the revision row. Returns false for a stale
-- config snapshot or an unfinished/non-building generation.
-- name: PublishRatingRebuild :one
SELECT publish_rating_rebuild(@generation_id::uuid, @tenant_id::uuid)::boolean;

-- name: AbortRatingRebuild :execrows
WITH aborted AS (
    UPDATE rating_rebuild_checkpoints cp SET phase = 'aborted', heartbeat_at = now()
    FROM rating_score_generations gen
    WHERE cp.generation_id = @generation_id AND cp.tenant_id = @tenant_id
      AND gen.id = cp.generation_id AND gen.tenant_id = cp.tenant_id
      AND gen.status = 'building' AND cp.phase <> 'complete'
    RETURNING cp.generation_id
)
UPDATE rating_score_generations gen SET status = 'retired'
FROM aborted WHERE gen.id = aborted.generation_id;
