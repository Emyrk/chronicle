BEGIN;

ALTER TABLE log_instances
  ADD COLUMN retention_expires_at TIMESTAMPTZ,
  ADD COLUMN retention_policy_key TEXT NOT NULL DEFAULT 'default',
  ADD CONSTRAINT log_instances_retention_policy_key_not_empty
    CHECK (retention_policy_key <> '');

CREATE INDEX log_instances_retention_expired_idx
  ON log_instances (retention_expires_at, id)
  WHERE retention_expires_at IS NOT NULL;

DROP TABLE retention_rules;
DROP TABLE retention_policies;

DROP VIEW chronicle_users;
ALTER TABLE users DROP COLUMN raw_log_retention_hours;
CREATE VIEW chronicle_users AS
  SELECT
    u.*,
    COALESCE(sl.max_storage_bytes, 0) AS max_storage_bytes,
    sl.updated_at AS data_limit_updated_at,
    COALESCE(lf.total_size_bytes, 0) AS consumed_storage_bytes
  FROM users u
    LEFT JOIN user_storage_limits sl ON sl.user_id = u.id
    LEFT JOIN (
      SELECT owner, SUM(COALESCE(compressed_size_bytes, size_bytes)) AS total_size_bytes
      FROM log_file
      WHERE storage_deleted_at IS NULL
      GROUP BY owner
    ) lf ON lf.owner = u.id;

COMMIT;
