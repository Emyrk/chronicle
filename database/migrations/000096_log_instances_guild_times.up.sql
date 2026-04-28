DROP VIEW IF EXISTS log_instances_guild;

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
  COALESCE(wsr.name, 'Unknown') AS realm_name,
  g.name AS guild_name,
  g.realm_id AS guild_realm_id,
  g.created_at AS guild_created_at
FROM
  log_instances li
  LEFT JOIN wow_server_realms wsr ON wsr.id = li.realm_id
  LEFT JOIN guilds g ON li.guild_id = g.id
;