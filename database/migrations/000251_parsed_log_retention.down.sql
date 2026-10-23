BEGIN;

DROP VIEW chronicle_users;
ALTER TABLE users ADD COLUMN raw_log_retention_hours INT;
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

CREATE TABLE retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES wow_servers(id) ON DELETE CASCADE,
  realm_id UUID REFERENCES wow_server_realms(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  total_deleted BIGINT NOT NULL DEFAULT 0,
  total_kept BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT retention_policies_scope CHECK (
    (server_id IS NOT NULL AND realm_id IS NULL) OR
    (server_id IS NULL AND realm_id IS NOT NULL)
  ),
  CONSTRAINT retention_policies_unique_server UNIQUE (server_id),
  CONSTRAINT retention_policies_unique_realm UNIQUE (realm_id)
);
CREATE TABLE retention_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES retention_policies(id) ON DELETE CASCADE,
  priority INT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('keep', 'delete')),
  conditions JSONB NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retention_rules_unique_priority UNIQUE (policy_id, priority)
);

DROP INDEX log_instances_retention_expired_idx;
ALTER TABLE log_instances
  DROP CONSTRAINT log_instances_retention_policy_key_not_empty,
  DROP COLUMN retention_policy_key,
  DROP COLUMN retention_expires_at;

COMMIT;
