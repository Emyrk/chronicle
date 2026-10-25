BEGIN;

CREATE TABLE log_group_artifacts (
  id UUID PRIMARY KEY,
  log_group_id UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  hash TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  mime_type TEXT NOT NULL,
  content_encoding TEXT,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  storage_deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX log_group_artifacts_log_group_id_idx
  ON log_group_artifacts(log_group_id);

CREATE INDEX log_group_artifacts_kind_idx
  ON log_group_artifacts(kind);

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
