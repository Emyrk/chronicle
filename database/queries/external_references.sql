-- name: UpsertExternalReferenceEntity :one
INSERT INTO external_reference_entities (
    tenant_id,
    realm_id,
    kind,
    name,
    first_seen_at,
    last_seen_at
)
VALUES (@tenant_id, @realm_id, @kind, @name, @observed_at, @observed_at)
ON CONFLICT (tenant_id, realm_id, kind, normalized_name)
DO UPDATE SET
    name = CASE
        WHEN EXCLUDED.last_seen_at >= external_reference_entities.last_seen_at THEN EXCLUDED.name
        ELSE external_reference_entities.name
    END,
    first_seen_at = LEAST(external_reference_entities.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at = GREATEST(external_reference_entities.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = now()
RETURNING *;

-- name: InsertExternalReferenceContent :exec
INSERT INTO external_reference_contents (
    tenant_id,
    kind,
    schema_version,
    content_hash,
    payload
)
VALUES (@tenant_id, @kind, @schema_version, @content_hash, @payload)
ON CONFLICT (tenant_id, kind, schema_version, content_hash) DO NOTHING;

-- name: GetExternalReferenceContent :one
SELECT *
FROM external_reference_contents
WHERE tenant_id = @tenant_id
  AND kind = @kind
  AND schema_version = @schema_version
  AND content_hash = @content_hash
  AND payload = @payload;

-- name: LockExternalReferenceEntity :one
SELECT id
FROM external_reference_entities
WHERE id = @entity_id
FOR UPDATE;

-- name: GetLatestExternalReferenceSnapshotForDay :one
SELECT *
FROM external_reference_snapshots
WHERE entity_id = @entity_id
  AND observed_on = @observed_on
ORDER BY sequence DESC
LIMIT 1;

-- name: UpdateExternalReferenceSnapshotObservation :one
UPDATE external_reference_snapshots
SET observed_at = LEAST(observed_at, @observation_time),
    last_observed_at = GREATEST(last_observed_at, @observation_time)
WHERE id = @snapshot_id
RETURNING *;

-- name: InsertExternalReferenceSnapshot :one
INSERT INTO external_reference_snapshots (
    tenant_id,
    kind,
    entity_id,
    content_id,
    observed_on,
    sequence,
    observed_at,
    last_observed_at
)
VALUES (
    @tenant_id,
    @kind,
    @entity_id,
    @content_id,
    @observed_on,
    @sequence,
    @observation_time,
    @observation_time
)
RETURNING *;

-- name: SetExternalReferenceCurrentSnapshot :exec
UPDATE external_reference_entities entity
SET current_snapshot_id = @snapshot_id,
    updated_at = now()
WHERE entity.id = @entity_id
  AND (
    entity.current_snapshot_id IS NULL
    OR EXISTS (
        SELECT 1
        FROM external_reference_snapshots current_snapshot
        JOIN external_reference_snapshots candidate
          ON candidate.id = @snapshot_id
         AND candidate.entity_id = entity.id
        WHERE current_snapshot.id = entity.current_snapshot_id
          AND current_snapshot.entity_id = entity.id
          AND (
            candidate.last_observed_at > current_snapshot.last_observed_at
            OR (
                candidate.last_observed_at = current_snapshot.last_observed_at
                AND candidate.observed_at >= current_snapshot.observed_at
            )
          )
    )
  );

-- name: GetExternalReferenceEntityByName :one
SELECT *
FROM external_reference_entities
WHERE tenant_id = @tenant_id
  AND realm_id = @realm_id
  AND kind = @kind
  AND normalized_name = lower(btrim(@name));

-- name: GetExternalReferenceCurrentSnapshot :one
SELECT
    sqlc.embed(entity),
    sqlc.embed(snapshot),
    sqlc.embed(content)
FROM external_reference_entities entity
JOIN external_reference_snapshots snapshot ON snapshot.id = entity.current_snapshot_id
JOIN external_reference_contents content ON content.id = snapshot.content_id
WHERE entity.id = @entity_id;

-- name: GetExternalReferenceSnapshotAt :one
SELECT
    sqlc.embed(entity),
    sqlc.embed(snapshot),
    sqlc.embed(content)
FROM external_reference_entities entity
JOIN external_reference_snapshots snapshot ON snapshot.entity_id = entity.id
JOIN external_reference_contents content ON content.id = snapshot.content_id
WHERE entity.tenant_id = @tenant_id
  AND entity.realm_id = @realm_id
  AND entity.kind = @kind
  AND entity.normalized_name = lower(btrim(@name))
  AND snapshot.observed_at <= @observed_at
ORDER BY snapshot.observed_at DESC, snapshot.last_observed_at DESC, snapshot.sequence DESC
LIMIT 1;

-- name: ListExternalReferenceSnapshotHistory :many
SELECT
    sqlc.embed(snapshot),
    sqlc.embed(content)
FROM external_reference_snapshots snapshot
JOIN external_reference_contents content ON content.id = snapshot.content_id
WHERE snapshot.entity_id = @entity_id
ORDER BY snapshot.observed_at DESC, snapshot.last_observed_at DESC, snapshot.sequence DESC;
