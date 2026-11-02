BEGIN;

CREATE VIEW guild_speedrun_ranks AS
SELECT
  instance_id,
  instance_name,
  realm_id,
  guild_id,
  duration_ms,
  RANK() OVER (
    PARTITION BY guild_id, instance_name, realm_id
    ORDER BY duration_ms ASC
  ) AS guild_rank
FROM instance_speedruns
WHERE qualified = true AND guild_id IS NOT NULL;

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

DROP VIEW chronicle_users;

ALTER TABLE users
  ADD COLUMN raw_log_retention_hours INT;

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

UPDATE users
SET raw_log_retention_hours = 48
WHERE id = '8e3cd4a1-a9f6-4190-8de5-ef037e534981';

COMMIT;
