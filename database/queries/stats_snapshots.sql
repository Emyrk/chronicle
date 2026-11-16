-- name: GetStatsSnapshot :one
-- Reads one /stats snapshot by primary key. The only query a /stats page hit runs.
SELECT * FROM stats_snapshots
WHERE tenant_id = @tenant_id AND page_key = @page_key;

-- name: ListStatsSnapshotMeta :many
-- Lists a tenant's snapshots without payloads, for the sitemap and for the
-- snapshot job's cadence check.
SELECT page_key, producer_key, sample_n, min_sample, computed_at, payload_changed_at
FROM stats_snapshots
WHERE tenant_id = @tenant_id
ORDER BY page_key;

-- name: UpsertStatsSnapshot :one
-- Writes a snapshot and reports whether its payload changed (always true for a
-- new row). payload_changed_at moves only on a change. jsonb compares
-- normalized values, so key order and whitespace never count as a change.
INSERT INTO stats_snapshots (tenant_id, page_key, producer_key, payload, sample_n, min_sample, computed_at, payload_changed_at)
VALUES (@tenant_id, @page_key, @producer_key, @payload, @sample_n, @min_sample, @computed_at, @computed_at)
ON CONFLICT (tenant_id, page_key) DO UPDATE
SET producer_key = EXCLUDED.producer_key,
    payload = EXCLUDED.payload,
    sample_n = EXCLUDED.sample_n,
    min_sample = EXCLUDED.min_sample,
    computed_at = EXCLUDED.computed_at,
    payload_changed_at = CASE
      WHEN stats_snapshots.payload IS DISTINCT FROM EXCLUDED.payload THEN EXCLUDED.computed_at
      ELSE stats_snapshots.payload_changed_at
    END
RETURNING (payload_changed_at = computed_at)::boolean AS changed;

-- name: DeleteStatsTenantPages :execrows
-- Drops a tenant's snapshots except one producer's (the activity row), used
-- when the tenant falls below the /stats activity threshold.
DELETE FROM stats_snapshots
WHERE tenant_id = @tenant_id AND producer_key <> @keep_producer_key;

-- name: DeleteStatsFamilyStale :execrows
-- Drops one family's snapshots that its latest run did not emit.
DELETE FROM stats_snapshots
WHERE tenant_id = @tenant_id AND producer_key = @producer_key
  AND NOT (page_key = ANY(@keep_page_keys::text[]));

-- name: DeleteStatsUnregistered :execrows
-- Drops snapshots of families no longer registered, once they are old enough
-- that a rolling deploy or rollback cannot still be serving them.
DELETE FROM stats_snapshots
WHERE tenant_id = @tenant_id
  AND NOT (producer_key = ANY(@registered_producer_keys::text[]))
  AND computed_at < @before::timestamptz;

-- name: StatsTenantRaidCount :one
-- Counts the request tenant's listed raids (logical runs, so duplicate uploads
-- count once) since a cutoff. RLS on wow_server_realms scopes it to the tenant
-- in context (root: untenanted and include_in_all realms). Background job only.
SELECT COUNT(DISTINCT COALESCE(li.duplicate_group_id, li.id))::bigint
FROM log_instances li
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
WHERE li.start_time >= @since::timestamptz
  AND li.category = 'raid'
  AND li.invalidated_at IS NULL;

-- name: StatsTenantPlayerCount :one
-- Counts the request tenant's distinct players seen in listed logs since a
-- cutoff. Heavier than the raid count, so the job runs it only when the raid
-- count alone does not decide the threshold. Background job only.
SELECT COUNT(DISTINCT (li.realm_id, lip.unit_guid))::bigint
FROM log_instances li
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
JOIN log_instance_players lip ON lip.instance_id = li.id
WHERE li.start_time >= @since::timestamptz
  AND li.invalidated_at IS NULL;

-- name: StatsHubLogs :one
-- The request tenant's listed logs with raids or dungeons that started since
-- @since and since @since_recent (the later cutoff), in one scan without the
-- players join. RLS on wow_server_realms scopes it. Background job only.
SELECT
  COUNT(DISTINCT li.log_group_id) FILTER (WHERE li.start_time >= @since_recent::timestamptz)::bigint AS logs_recent,
  COUNT(DISTINCT li.log_group_id)::bigint AS logs
FROM log_instances li
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
WHERE li.start_time >= @since::timestamptz
  AND li.invalidated_at IS NULL
  AND li.category IN ('raid', 'dungeon');

-- name: StatsHubPlayers :one
-- Distinct players seen in the request tenant's listed logs since @since and
-- since @since_recent, in one scan. Background job only.
SELECT
  COUNT(DISTINCT (li.realm_id, lip.unit_guid)) FILTER (WHERE li.start_time >= @since_recent::timestamptz)::bigint AS players_recent,
  COUNT(DISTINCT (li.realm_id, lip.unit_guid))::bigint AS players
FROM log_instances li
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
JOIN log_instance_players lip ON lip.instance_id = li.id
WHERE li.start_time >= @since::timestamptz
  AND li.invalidated_at IS NULL;

-- name: StatsHubInstances :many
-- The request tenant's raids and dungeons with listed runs since @since, with
-- run counts (logical runs, so duplicate uploads count once) since @since and
-- since @since_recent. A logical run has one instance name, so the hub's raid
-- and dungeon totals are sums of these rows.
SELECT
  li.name,
  li.category::text AS category,
  COUNT(DISTINCT COALESCE(li.duplicate_group_id, li.id)) FILTER (WHERE li.start_time >= @since_recent::timestamptz)::bigint AS runs_recent,
  COUNT(DISTINCT COALESCE(li.duplicate_group_id, li.id))::bigint AS runs
FROM log_instances li
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
WHERE li.start_time >= @since::timestamptz
  AND li.invalidated_at IS NULL
  AND li.category IN ('raid', 'dungeon')
GROUP BY li.name, li.category
ORDER BY li.category DESC, runs DESC, li.name;

-- name: StatsHubSpeedruns :many
-- Qualified speedruns per instance name in the request tenant's listed,
-- valid logs, all time (the speedrun boards' scope).
SELECT sr.instance_name, COUNT(*)::bigint AS speedruns
FROM instance_speedruns sr
JOIN wow_server_realms wsr ON wsr.id = sr.realm_id
JOIN log_instances li ON li.id = sr.instance_id AND li.invalidated_at IS NULL
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted
WHERE sr.qualified
GROUP BY sr.instance_name;
