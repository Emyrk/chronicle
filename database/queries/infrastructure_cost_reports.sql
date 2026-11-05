-- name: AcquireInfrastructureCostReportLock :exec
SELECT pg_advisory_xact_lock(hashtextextended(@period_start::text || '/' || @period_end::text, 339));

-- name: InfrastructureCostUserActivity :many
WITH period_files AS (
  SELECT
    lf.owner AS user_id,
    COUNT(*)::bigint AS uploaded_files,
    COUNT(DISTINCT lf.wow_log_id) FILTER (WHERE lf.wow_log_id IS NOT NULL)::bigint AS uploaded_log_groups,
    COALESCE(SUM(lf.size_bytes), 0)::bigint AS uploaded_raw_bytes,
    COALESCE(SUM(COALESCE(lf.compressed_size_bytes, lf.size_bytes)), 0)::bigint AS uploaded_stored_bytes
  FROM log_file lf
  WHERE lf.created_at >= @period_start AND lf.created_at < @period_end
  GROUP BY lf.owner
), period_groups AS (
  SELECT wlg.owner AS user_id, wlg.id AS log_group_id
  FROM wow_log_groups wlg
  WHERE wlg.created_at >= @period_start AND wlg.created_at < @period_end
), period_instances AS (
  SELECT
    pg.user_id,
    COUNT(DISTINCT li.id)::bigint AS parsed_instances,
    COALESCE(SUM(octet_length(lie.events)), 0)::bigint AS monthly_parsed_bytes
  FROM period_groups pg
  JOIN log_instances li ON li.log_group_id = pg.log_group_id
  LEFT JOIN log_instance_events lie ON lie.instance_id = li.id
  GROUP BY pg.user_id
), current_parsed AS (
  SELECT
    wlg.owner AS user_id,
    COALESCE(SUM(octet_length(lie.events)), 0)::bigint AS current_parsed_bytes
  FROM wow_log_groups wlg
  JOIN log_instances li ON li.log_group_id = wlg.id
  JOIN log_instance_events lie ON lie.instance_id = li.id
  GROUP BY wlg.owner
), relevant AS (
  SELECT user_id FROM period_files
  UNION
  SELECT user_id FROM current_parsed WHERE current_parsed_bytes > 0
)
SELECT
  u.id AS user_id,
  u.username AS username_snapshot,
  (COALESCE(pf.uploaded_files, 0) > 0)::boolean AS active_uploader,
  COALESCE(pf.uploaded_files, 0)::bigint AS uploaded_files,
  COALESCE(pf.uploaded_log_groups, 0)::bigint AS uploaded_log_groups,
  COALESCE(pf.uploaded_raw_bytes, 0)::bigint AS uploaded_raw_bytes,
  COALESCE(pf.uploaded_stored_bytes, 0)::bigint AS uploaded_stored_bytes,
  COALESCE(pi.parsed_instances, 0)::bigint AS parsed_instances,
  COALESCE(pi.monthly_parsed_bytes, 0)::bigint AS monthly_parsed_bytes,
  COALESCE(cp.current_parsed_bytes, 0)::bigint AS current_parsed_bytes
FROM relevant r
JOIN users u ON u.id = r.user_id
LEFT JOIN period_files pf ON pf.user_id = r.user_id
LEFT JOIN period_instances pi ON pi.user_id = r.user_id
LEFT JOIN current_parsed cp ON cp.user_id = r.user_id
ORDER BY u.id;

-- name: InfrastructureCostPeriodUserCounts :one
SELECT
  COUNT(*) FILTER (WHERE created_at < @period_end)::bigint AS registered_users_at_end,
  COUNT(*) FILTER (WHERE created_at >= @period_start AND created_at < @period_end)::bigint AS new_users
FROM users;

-- name: InsertInfrastructureCostReport :one
INSERT INTO infrastructure_cost_reports (
  id, period_start, period_end, revision, status, storage_as_of, provider,
  provider_payload, provider_payload_sha256, total_cost_microdollars,
  active_uploader_count, storage_owner_count, warning_count, report
) VALUES (
  @id, @period_start, @period_end, @revision, @status, @storage_as_of, @provider,
  @provider_payload, @provider_payload_sha256, @total_cost_microdollars,
  @active_uploader_count, @storage_owner_count, @warning_count, @report
)
RETURNING *;

-- name: InsertInfrastructureCostReportUser :exec
INSERT INTO infrastructure_cost_report_users (
  report_id, user_id, username_snapshot, active_uploader, uploaded_files,
  monthly_parsed_bytes, current_parsed_bytes, shared_cost_microdollars,
  activity_cost_microdollars, storage_cost_microdollars, total_cost_microdollars
) VALUES (
  @report_id, @user_id, @username_snapshot, @active_uploader, @uploaded_files,
  @monthly_parsed_bytes, @current_parsed_bytes, @shared_cost_microdollars,
  @activity_cost_microdollars, @storage_cost_microdollars, @total_cost_microdollars
);

-- name: GetLatestInfrastructureCostReportForPeriod :one
SELECT * FROM infrastructure_cost_reports
WHERE period_start = @period_start AND period_end = @period_end
ORDER BY revision DESC
LIMIT 1;

-- name: GetInfrastructureCostReport :one
SELECT * FROM infrastructure_cost_reports WHERE id = @id;

-- name: ListInfrastructureCostReports :many
SELECT * FROM infrastructure_cost_reports
ORDER BY period_start DESC, revision DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountInfrastructureCostReports :one
SELECT COUNT(*)::bigint FROM infrastructure_cost_reports;

-- name: PreviousInfrastructureCostReportTotal :one
SELECT total_cost_microdollars FROM infrastructure_cost_reports
WHERE period_end <= @period_start
ORDER BY period_end DESC, revision DESC
LIMIT 1;

-- name: ListInfrastructureCostReportUsers :many
SELECT * FROM infrastructure_cost_report_users
WHERE report_id = @report_id
ORDER BY total_cost_microdollars DESC, user_id
LIMIT @limit_count OFFSET @offset_count;

-- name: CountInfrastructureCostReportUsers :one
SELECT COUNT(*)::bigint FROM infrastructure_cost_report_users WHERE report_id = @report_id;
