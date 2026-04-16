-- name: InsertRegressionFixture :one
INSERT INTO regression_fixtures (log_group_id, note) VALUES (@log_group_id, @note) RETURNING *;

-- name: DeleteRegressionFixture :exec
DELETE FROM regression_fixtures WHERE id = @id;

-- name: UpdateRegressionFixtureNote :exec
UPDATE regression_fixtures SET note = @note WHERE id = @id;

-- name: GetRegressionFixture :one
SELECT * FROM regression_fixtures WHERE id = @id;

-- name: ListRegressionFixtures :many
SELECT rf.*
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

-- name: UpdateInstanceParserVersion :exec
UPDATE log_instances SET parser_version = @parser_version WHERE id = @id;

-- name: ListInstancesByParserVersion :many
SELECT id, log_group_id FROM log_instances WHERE parser_version = @parser_version;

-- name: DeleteRegressionSnapshot :exec
DELETE FROM regression_snapshots WHERE id = @id;
