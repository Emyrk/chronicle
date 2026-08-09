BEGIN;

-- Migration 000172 was briefly reused by two changes. Databases that applied
-- the gear progression migration under that version skipped the vehicle
-- metadata migration, so repair the schema under a new version.
DROP VIEW IF EXISTS log_instances_guild;

ALTER TABLE log_instances
  ADD COLUMN IF NOT EXISTS vehicle_control_intervals JSONB NOT NULL DEFAULT '{}'::jsonb;

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
FROM
  log_instances li
  LEFT JOIN wow_server_realms wsr ON wsr.id = li.realm_id
  LEFT JOIN wow_servers ws ON wsr.server_id = ws.id
  LEFT JOIN tenants t ON ws.tenant_id = t.id
  LEFT JOIN guilds g ON li.guild_id = g.id
  LEFT JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
;

COMMIT;
