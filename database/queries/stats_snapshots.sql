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

-- name: StatsCensusCounts :many
-- Characters seen in listed raid logs, by class, race and observed faction, for
-- the /stats census, over two windows in one pass: count_long since
-- @since_long and count_recent since @since_recent (the later cutoff). RLS on
-- wow_server_realms scopes it to the request tenant (root: untenanted and
-- include_in_all realms). "Seen in raid logs" means a listed, valid raid log
-- (dungeons do not count). A character counts for a window when it was updated
-- in the window and its latest sighting (updated_from_instance) is such a log,
-- or such a log started in the window shows it, so a character seen only in
-- unlisted, invalidated or dungeon logs is excluded. The exact sighting check
-- (the latest start time among listed raid logs since @since_long, which decides
-- both windows) only runs for characters whose latest sighting does not qualify.
-- Background job only.
SELECT
  gp.class,
  gp.race,
  gp.faction,
  (COUNT(*) FILTER (
    WHERE gp.updated_at >= @since_recent::timestamptz
      AND (seen.pointer_ok OR seen.last_sighting >= @since_recent::timestamptz)
  ))::bigint AS count_recent,
  COUNT(*)::bigint AS count_long
FROM game_players gp
JOIN wow_server_realms wsr ON wsr.id = gp.realm_id
CROSS JOIN LATERAL (
  SELECT
    p.ok AS pointer_ok,
    CASE WHEN p.ok THEN NULL ELSE (
      SELECT max(li.start_time)
      FROM log_instance_players lip
      JOIN log_instances li ON li.id = lip.instance_id
        AND li.realm_id = gp.realm_id
        AND li.category = 'raid'
        AND li.start_time >= @since_long::timestamptz
        AND li.invalidated_at IS NULL
      JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted AND wlg.invalidated_at IS NULL
      WHERE lip.unit_guid = gp.id
    ) END AS last_sighting
  FROM (
    SELECT EXISTS (
      SELECT 1
      FROM log_instances li
      JOIN wow_log_groups wlg ON wlg.id = li.log_group_id AND NOT wlg.unlisted AND wlg.invalidated_at IS NULL
      WHERE li.id = gp.updated_from_instance
        AND li.category = 'raid'
        AND li.invalidated_at IS NULL
    ) AS ok
  ) p
) seen
WHERE gp.updated_at >= @since_long::timestamptz
  AND (seen.pointer_ok OR seen.last_sighting IS NOT NULL)
GROUP BY gp.class, gp.race, gp.faction
ORDER BY gp.class, gp.race, gp.faction;
