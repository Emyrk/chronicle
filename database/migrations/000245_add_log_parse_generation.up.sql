BEGIN;

ALTER TABLE wow_log_groups
  ADD COLUMN parse_generation bigint NOT NULL DEFAULT 1 CHECK (parse_generation > 0);

ALTER TABLE parsed_log_group
  ADD COLUMN parse_generation bigint NOT NULL DEFAULT 1,
  ADD COLUMN finalized_at timestamptz DEFAULT now();

ALTER TABLE parsed_log_group
  ALTER COLUMN finalized_at DROP DEFAULT;

DROP VIEW log_instances_guild;
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
  COALESCE(wsr.name, 'Unknown') AS realm_name,
  g.name AS guild_name,
  g.realm_id AS guild_realm_id,
  g.created_at AS guild_created_at,
  ws.name AS server_name,
  t.name AS tenant_name,
  t.slug AS tenant_slug,
  COALESCE(t.include_in_all, TRUE) AS tenant_include_in_all,
  wlg.format,
  wlg.flavor
FROM log_instances li
JOIN wow_log_groups wlg
  ON wlg.id = li.log_group_id
JOIN parsed_log_group plg
  ON plg.id = li.log_group_id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
LEFT JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN wow_servers ws ON wsr.server_id = ws.id
LEFT JOIN tenants t ON ws.tenant_id = t.id
LEFT JOIN guilds g ON li.guild_id = g.id;

COMMIT;
