-- Publication must delete, insert the header, and insert every record in one caller-owned transaction.
-- name: DeleteLogIdentityCatalogue :exec
DELETE FROM log_identity_catalogues WHERE log_group_id = $1;

-- name: InsertLogIdentityCatalogue :one
INSERT INTO log_identity_catalogues (log_group_id, generation, dataset_id, dataset_revision, format, flavor, parser_engine, parser_build, catalogue_version, rule_version, first_seen, last_seen, guid_count, event_count, zero_guid_count)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *;

-- name: InsertLogIdentityCatalogueRecords :batchexec
INSERT INTO log_identity_catalogue_records (log_group_id, guid, classification, is_unknown, has_conflicts, payload)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: GetLogIdentityCatalogue :one
SELECT * FROM log_identity_catalogues WHERE log_group_id = $1;

-- name: ListLogIdentityCatalogues :many
SELECT * FROM log_identity_catalogues WHERE log_group_id = ANY(@log_group_ids::uuid[]);

-- name: ListLogIdentityCatalogueRecords :many
SELECT * FROM log_identity_catalogue_records
WHERE log_group_id = @log_group_id
  AND (NOT @has_after::boolean OR guid > @after_guid::wow_guid)
  AND (@review::text = 'all' OR (@review::text = 'unknown' AND is_unknown) OR (@review::text = 'conflicts' AND has_conflicts))
ORDER BY guid LIMIT @row_limit::integer;

-- name: DownloadLogIdentityCatalogueRecords :many
SELECT * FROM log_identity_catalogue_records WHERE log_group_id = $1 ORDER BY guid;
