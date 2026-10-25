BEGIN;

ALTER TABLE users
  ADD COLUMN character_cosmetics text NOT NULL DEFAULT 'enabled'
  CHECK (character_cosmetics IN ('enabled', 'limited', 'disabled'));

DROP VIEW chronicle_users;
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
        SELECT owner, COALESCE(compressed_size_bytes, size_bytes) AS size_bytes
        FROM log_file
        WHERE storage_deleted_at IS NULL

        UNION ALL

        SELECT groups.owner, artifacts.size_bytes
        FROM log_group_artifacts artifacts
        JOIN wow_log_groups groups ON groups.id = artifacts.log_group_id
        WHERE artifacts.storage_deleted_at IS NULL
      ) stored
      GROUP BY owner
    ) storage ON storage.owner = u.id;

COMMIT;
