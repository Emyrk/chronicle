-- name: ResyncCandidateLogGroups :many
-- Returns log groups that have been parsed and still have raw files on storage.
-- Filtering by parser version is done in Go using semverenc for full
-- major.minor.patch comparison. The caller deduplicates rows by log group and
-- applies its own distinct log-group limit.
SELECT DISTINCT
  wlg.id,
  wlg.owner,
  wlg.log_type,
  wlg.format,
  wlg.flavor,
  wlg.created_at,
  li.parser_version,
  li.name AS instance_name,
  li.realm_id
FROM wow_log_groups wlg
JOIN parsed_log_group plg ON plg.id = wlg.id
JOIN log_instances li ON li.log_group_id = wlg.id
WHERE EXISTS(
    SELECT 1 FROM log_file lf
    WHERE lf.wow_log_id = wlg.id
    AND lf.storage_deleted_at IS NULL
  )
ORDER BY wlg.created_at ASC;
