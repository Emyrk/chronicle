BEGIN;

ALTER TABLE log_file ADD COLUMN storage_deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN log_file.storage_deleted_at IS 'The timestamp when the file was deleted from storage. This allows us to keep track of files that have been removed from storage, even if the log_file record still exists in the database.';

CREATE TABLE data_limit (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_storage_bytes BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO data_limit (user_id, updated_at, max_storage_bytes)
SELECT id, NOW(), 500000000 -- 500mb default limit
FROM users;

CREATE VIEW chronicle_users AS
  SELECT
    u.*,
    dl.max_storage_bytes,
    dl.updated_at AS data_limit_updated_at,
    COALESCE(lf.total_size_bytes, 0) AS consumed_storage_bytes
  FROM users u
    LEFT JOIN data_limit dl ON dl.user_id = u.id
    LEFT JOIN (
      SELECT owner, SUM(size_bytes) AS total_size_bytes
      FROM log_file
      WHERE storage_deleted_at IS NULL
      GROUP BY owner
    ) lf ON lf.owner = u.id
;

END;