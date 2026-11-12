BEGIN;

CREATE OR REPLACE VIEW log_instances_guild AS
SELECT
  li.id, li.realm_id, li.log_group_id, li.name, li.hashed_slug, li.guild_id,
  li.capabilities, li.versions, li.recorder_name, li.recorder_guid,
  li.duplicate_group_id, li.start_time, li.end_time, li.difficulty_name,
  li.max_players, li.dynamic_difficulty, li.mixed_difficulty,
  li.vehicle_control_intervals, li.invalidated_at, li.invalid_reason,
  COALESCE(wsr.name, 'Unknown') AS realm_name,
  g.name AS guild_name, g.realm_id AS guild_realm_id, g.created_at AS guild_created_at,
  ws.name AS server_name, t.name AS tenant_name, t.slug AS tenant_slug,
  COALESCE(t.include_in_all, true) AS tenant_include_in_all,
  wlg.format, wlg.flavor, wlg.upload_source
FROM log_instances li
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
JOIN parsed_log_group plg ON plg.id = li.log_group_id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
LEFT JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN wow_servers ws ON wsr.server_id = ws.id
LEFT JOIN tenants t ON ws.tenant_id = t.id
LEFT JOIN guilds g ON li.guild_id = g.id;
DROP VIEW encounter_dps_rankings_resolved;
DROP VIEW log_instances_resolved;
ALTER TABLE log_instances DROP COLUMN difficulty_normalized;


-- Rolling back discards the new per-attempt difficulty evidence. Reparse logs
-- after a rollback if the draft representation is needed again.
ALTER TABLE log_instance_encounters
    DROP COLUMN difficulty,
    ADD COLUMN difficulty_name text NOT NULL DEFAULT '',
    ADD COLUMN max_players integer NOT NULL DEFAULT 0 CHECK (max_players >= 0),
    ADD COLUMN dynamic_difficulty integer NOT NULL DEFAULT 0 CHECK (dynamic_difficulty >= 0);
DROP TABLE log_instance_difficulties;
CREATE TABLE log_instance_difficulties (
    instance_id uuid NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    difficulty_name text NOT NULL,
    max_players integer NOT NULL CHECK (max_players >= 0),
    dynamic_difficulty integer NOT NULL DEFAULT 0 CHECK (dynamic_difficulty >= 0),
    PRIMARY KEY (instance_id, difficulty_name, max_players, dynamic_difficulty)
);
COMMIT;
