BEGIN;

CREATE TYPE log_event_storage AS ENUM ('database', 'r2');

DROP VIEW log_instances_guild;

ALTER TABLE log_instances
  ADD COLUMN event_storage log_event_storage NOT NULL DEFAULT 'database';

ALTER TABLE log_instance_events
  ADD COLUMN storage log_event_storage NOT NULL DEFAULT 'database',
  ADD COLUMN object_key TEXT,
  -- Zero marks a legacy inline row whose size has not been backfilled. Keeping
  -- this metadata-only default avoids reading and rewriting the large TOAST
  -- table during the startup migration. New writers always store the real size.
  ADD COLUMN size_bytes BIGINT NOT NULL DEFAULT 0;

ALTER TABLE log_instance_events
  ALTER COLUMN events DROP NOT NULL,
  ADD CONSTRAINT log_instance_events_storage_payload_check CHECK (
    (storage = 'database' AND events IS NOT NULL AND object_key IS NULL)
    OR
    (storage = 'r2' AND events IS NULL AND object_key IS NOT NULL)
  ),
  ADD CONSTRAINT log_instance_events_size_bytes_check CHECK (size_bytes >= 0),
  ADD CONSTRAINT log_instance_events_instance_type_key UNIQUE (instance_id, type);

CREATE VIEW log_instances_guild AS
SELECT
  li.id,
  li.realm_id,
  li.log_group_id,
  li.name,
  li.hashed_slug,
  li.guild_id,
  li.capabilities,
  li.versions,
  li.recorder_name,
  li.recorder_guid,
  li.duplicate_group_id,
  li.start_time,
  li.end_time,
  li.difficulty_name,
  li.max_players,
  li.dynamic_difficulty,
  li.vehicle_control_intervals,
  li.invalidated_at,
  li.invalid_reason,
  li.event_storage,
  COALESCE(wsr.name, 'Unknown') AS realm_name,
  g.name AS guild_name,
  g.realm_id AS guild_realm_id,
  g.created_at AS guild_created_at,
  ws.name AS server_name,
  t.name AS tenant_name,
  t.slug AS tenant_slug,
  COALESCE(t.include_in_all, true) AS tenant_include_in_all,
  wlg.format AS format,
  wlg.flavor AS flavor
FROM log_instances li
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
JOIN parsed_log_group plg
  ON plg.id = li.log_group_id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
LEFT JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN wow_servers ws ON wsr.server_id = ws.id
LEFT JOIN tenants t ON ws.tenant_id = t.id
LEFT JOIN guilds g ON li.guild_id = g.id;

CREATE TABLE event_object_deletion_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE event_object_deletion_outbox IS
  'Durable outbox of event-stream object keys awaiting idempotent object-storage deletion.';

COMMIT;
