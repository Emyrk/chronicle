-- name: InsertRegressionFixture :one
INSERT INTO regression_fixtures (log_group_id, note) VALUES (@log_group_id, @note) RETURNING *;

-- name: DeleteRegressionFixture :exec
DELETE FROM regression_fixtures WHERE id = @id;

-- name: UpdateRegressionFixtureNote :exec
UPDATE regression_fixtures SET note = @note WHERE id = @id;

-- name: GetRegressionFixture :one
SELECT * FROM regression_fixtures WHERE id = @id;

-- name: ListRegressionFixtures :many
SELECT rf.*,
  NOT EXISTS(
    SELECT 1 FROM log_file lf
    WHERE lf.wow_log_id = rf.log_group_id
    AND lf.storage_deleted_at IS NULL
  ) AS files_deleted
FROM regression_fixtures rf
ORDER BY rf.created_at DESC;

-- name: InsertRegressionSnapshot :one
INSERT INTO regression_snapshots (fixture_id, version, build_time, snapshot, matches_previous, previous_snapshot_id)
VALUES (@fixture_id, @version, @build_time, @snapshot, @matches_previous, @previous_snapshot_id) RETURNING *;

-- name: GetLatestRegressionSnapshot :one
SELECT * FROM regression_snapshots
WHERE fixture_id = @fixture_id
ORDER BY created_at DESC LIMIT 1;

-- name: ListRegressionSnapshots :many
SELECT id, fixture_id, version, build_time, matches_previous, previous_snapshot_id, created_at
FROM regression_snapshots WHERE fixture_id = @fixture_id
ORDER BY created_at DESC LIMIT @lim;

-- name: GetRegressionSnapshot :one
SELECT * FROM regression_snapshots WHERE id = @id;

-- name: ListInstancesByParserVersion :many
SELECT id, log_group_id FROM log_instances WHERE parser_version = @parser_version;

-- name: DeleteRegressionSnapshot :exec
DELETE FROM regression_snapshots WHERE id = @id;

-- name: CountActiveRegressionJobs :one
SELECT COUNT(*) FROM river_job
WHERE kind = 'regression-snapshot'
AND state IN ('available', 'pending', 'scheduled', 'running');

-- name: AdminListOutdatedParserVersionInstances :many
SELECT
  li.id,
  li.log_group_id,
  li.name,
  li.parser_version,
  li.hashed_slug,
  wsr.name as realm_name,
  u.username as uploader_name,
  wlg.created_at as uploaded_at,
  li.start_time,
  li.end_time
FROM log_instances li
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
JOIN users u ON u.id = wlg.owner
JOIN wow_server_realms wsr ON wsr.id = li.realm_id
WHERE (
    -- Keep these multipliers in sync with internal/semverenc.
    COALESCE(NULLIF(regexp_replace(split_part(trim(leading 'v' from split_part(li.parser_version, '+', 1)), '.', 1), '[^0-9].*$', ''), ''), '0')::bigint * 1000000000
    + COALESCE(NULLIF(regexp_replace(split_part(trim(leading 'v' from split_part(li.parser_version, '+', 1)), '.', 2), '[^0-9].*$', ''), ''), '0')::bigint * 10000000
    + COALESCE(NULLIF(regexp_replace(split_part(trim(leading 'v' from split_part(li.parser_version, '+', 1)), '.', 3), '[^0-9].*$', ''), ''), '0')::bigint * 10000
  ) < @min_parser_version_num::bigint
  AND (sqlc.narg('instance_name')::text IS NULL OR li.name ILIKE '%' || sqlc.narg('instance_name')::text || '%')
  AND EXISTS(
    SELECT 1 FROM log_file lf
    WHERE lf.wow_log_id = li.log_group_id
    AND lf.storage_deleted_at IS NULL
  )
ORDER BY (li.end_time - li.start_time) ASC NULLS LAST
LIMIT 50;

