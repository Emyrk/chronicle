BEGIN;

DROP VIEW chronicle_users;

ALTER TABLE users
  DROP COLUMN raw_log_retention_hours;

CREATE VIEW chronicle_users AS
  SELECT
    u.*,
    COALESCE(sl.max_storage_bytes, 0) AS max_storage_bytes,
    sl.updated_at AS data_limit_updated_at,
    COALESCE(storage.total_size_bytes, 0) AS consumed_storage_bytes
  FROM users u
    LEFT JOIN user_storage_limits sl ON sl.user_id = u.id
    LEFT JOIN (
      SELECT owner, SUM(size_bytes) AS total_size_bytes
      FROM (
        SELECT
          files.owner,
          COALESCE(files.compressed_size_bytes, files.size_bytes)
            - COALESCE(parts.rolled_up_size_bytes, 0)
            + COALESCE(parts.stored_size_bytes, 0) AS size_bytes
        FROM log_file files
        LEFT JOIN LATERAL (
          SELECT
            SUM(
              CASE
                WHEN files.compressed_size_bytes IS NULL THEN part.size_bytes
                ELSE COALESCE(part.compressed_size_bytes, part.size_bytes)
              END
            ) AS rolled_up_size_bytes,
            SUM(COALESCE(part.compressed_size_bytes, part.size_bytes)) AS stored_size_bytes
          FROM log_file_parts part
          WHERE part.log_file_id = files.id
            AND part.status = 'ready'
        ) parts ON true
        WHERE files.storage_deleted_at IS NULL

        UNION ALL

        SELECT groups.owner, artifacts.size_bytes
        FROM log_group_artifacts artifacts
        JOIN wow_log_groups groups ON groups.id = artifacts.log_group_id
        WHERE artifacts.storage_deleted_at IS NULL
      ) stored
      GROUP BY owner
    ) storage ON storage.owner = u.id;

-- Remove queued and historical jobs for worker kinds that no longer exist.
-- River creates its tables after application migrations on a fresh database,
-- while existing deployments already have the indexed river_job.kind column.
DO $$
BEGIN
  IF to_regclass('public.river_job') IS NOT NULL THEN
    EXECUTE 'DELETE FROM river_job WHERE kind IN (''retention'', ''retention-realm'', ''raw-log-retention'')';
  END IF;
END
$$;

DROP TABLE retention_rules;
DROP TABLE retention_policies;
DROP VIEW guild_speedrun_ranks;

COMMIT;
