BEGIN;

-- NULL identifies a legacy encounter. Empty text is explicitly Normal and must
-- never inherit a heroic parent. Adding a nullable column does not rewrite rows.
ALTER TABLE log_instance_encounters
    ADD COLUMN difficulty text,
    DROP COLUMN difficulty_name,
    DROP COLUMN max_players,
    DROP COLUMN dynamic_difficulty;

-- This is a derived ingestion summary. Reads derive the set from boss attempts,
-- so discarding draft-format summary rows does not discard encounter evidence.
DROP TABLE log_instance_difficulties;
CREATE TABLE log_instance_difficulties (
    instance_id uuid NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    difficulty text NOT NULL,
    PRIMARY KEY (instance_id, difficulty)
);

-- Legacy labels are not resolved difficulty keys. The marker lets future
-- explicit keys survive while every historical non-heroic label becomes Normal.
-- No encounter aggregation or historical row updates happen on this read path.
ALTER TABLE log_instances ADD COLUMN difficulty_normalized boolean NOT NULL DEFAULT false;
CREATE VIEW log_instances_resolved AS
SELECT
    li.id,
    li.realm_id,
    li.log_group_id,
    li.name,
    li.hashed_slug,
    li.guild_id,
    li.start_time,
    li.end_time,
    li.capabilities,
    li.versions,
    li.recorder_name,
    li.recorder_guid,
    li.parser_version,
    li.duplicate_group_id,
    CASE WHEN li.difficulty_normalized THEN li.difficulty_name
         WHEN li.dynamic_difficulty > 0 OR li.difficulty_name ILIKE '%heroic%'
         THEN 'heroic' ELSE '' END::text AS difficulty_name,
    li.max_players,
    li.dynamic_difficulty,
    li.vehicle_control_intervals,
    li.category,
    li.updated_at,
    li.invalidated_at,
    li.invalid_reason,
    li.mixed_difficulty
FROM log_instances li;

-- Preserve the caller's ranking RLS policies through the read adapter.
CREATE VIEW encounter_dps_rankings_resolved WITH (security_invoker = true) AS
SELECT
    ranking.id,
    ranking.encounter_id,
    ranking.instance_id,
    ranking.encounter_name,
    ranking.instance_name,
    ranking.player_guid,
    ranking.player_name,
    ranking.player_class,
    ranking.player_spec,
    ranking.player_role,
    ranking.player_level,
    ranking.talent_build_id,
    COALESCE(encounter.difficulty, instance.difficulty_name)::text AS difficulty_name,
    instance.max_players::smallint AS max_players,
    ranking.realm_id,
    ranking.realm_name,
    ranking.guild_id,
    ranking.guild_name,
    ranking.damage_done,
    ranking.duration_secs,
    ranking.dps,
    ranking.avg_ilvl,
    ranking.log_hashed_slug,
    ranking.killed_at,
    ranking.created_at,
    ranking.healing_done,
    ranking.absorbed_done,
    ranking.hps,
    ranking.player_sub_spec,
    ranking.player_deaths,
    ranking.alive_percentage,
    ranking.unranked_damage_done
FROM encounter_dps_rankings ranking
JOIN log_instances_resolved instance ON instance.id = ranking.instance_id
LEFT JOIN log_instance_encounters encounter ON encounter.id = ranking.encounter_id;

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
FROM log_instances_resolved li
JOIN wow_log_groups wlg ON wlg.id = li.log_group_id
JOIN parsed_log_group plg ON plg.id = li.log_group_id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
LEFT JOIN wow_server_realms wsr ON wsr.id = li.realm_id
LEFT JOIN wow_servers ws ON wsr.server_id = ws.id
LEFT JOIN tenants t ON ws.tenant_id = t.id
LEFT JOIN guilds g ON li.guild_id = g.id;

-- No data backfill runs during startup. See the bounded preview/backfill sqlc
-- queries in encounter_difficulty_backfill.sql for explicit offline repair.
COMMIT;
