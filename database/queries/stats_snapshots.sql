-- name: GetStatsSnapshot :one
-- Reads one /stats page's snapshot. The only query a /stats page hit runs.
SELECT * FROM stats_snapshots
WHERE tenant_id = @tenant_id AND page_key = @page_key;

-- name: ListStatsSnapshotMeta :many
-- Lists a tenant's snapshots without payloads, for the sitemap and for the
-- snapshot job's cadence check.
SELECT page_key, sample_n, computed_at
FROM stats_snapshots
WHERE tenant_id = @tenant_id
ORDER BY page_key;

-- name: UpsertStatsSnapshot :one
-- Writes a snapshot and reports whether its payload differs from the stored
-- one (always true for a new row). jsonb compares normalized values, so key
-- order and whitespace never count as a change.
WITH previous AS (
  SELECT payload FROM stats_snapshots
  WHERE tenant_id = @tenant_id AND page_key = @page_key
)
INSERT INTO stats_snapshots (tenant_id, page_key, payload, sample_n, computed_at)
VALUES (@tenant_id, @page_key, @payload, @sample_n, @computed_at)
ON CONFLICT (tenant_id, page_key) DO UPDATE
SET payload = EXCLUDED.payload,
    sample_n = EXCLUDED.sample_n,
    computed_at = EXCLUDED.computed_at
RETURNING ((SELECT payload FROM previous) IS DISTINCT FROM stats_snapshots.payload)::boolean AS changed;

-- name: DeleteStatsSnapshots :execrows
-- Drops every snapshot of a tenant, used when it falls below the /stats
-- activity threshold.
DELETE FROM stats_snapshots WHERE tenant_id = @tenant_id;

-- name: DeleteStatsSnapshotsExcept :execrows
-- Drops snapshots for pages that are no longer registered.
DELETE FROM stats_snapshots
WHERE tenant_id = @tenant_id AND NOT (page_key = ANY(@page_keys::text[]));

-- name: StatsTenantActivity :one
-- Counts the request tenant's listed raids (logical runs, so duplicate uploads
-- count once) and distinct players since a cutoff. RLS on wow_server_realms
-- scopes it to the tenant in context (root: untenanted and include_in_all
-- realms). Runs only in the background snapshot job, never per page request.
SELECT
  COUNT(DISTINCT COALESCE(li.duplicate_group_id, li.id)) FILTER (WHERE li.category = 'raid')::bigint AS raid_count,
  COUNT(DISTINCT (li.realm_id, lip.unit_guid)) FILTER (WHERE lip.unit_guid IS NOT NULL)::bigint AS player_count
FROM log_instances li
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
LEFT JOIN log_instance_players lip ON lip.instance_id = li.id
WHERE li.start_time >= @since::timestamptz
  AND li.invalidated_at IS NULL;
