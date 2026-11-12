BEGIN;

-- Restoring draft uniqueness can discard multi-difficulty evidence. Refuse
-- implicit scans or destructive deduplication on a populated rollback.
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM encounter_dps_rankings LIMIT 1)
       OR EXISTS (SELECT 1 FROM parse_score_memberships LIMIT 1)
       OR EXISTS (SELECT 1 FROM time_parse_boss_kill_memberships LIMIT 1)
       OR EXISTS (SELECT 1 FROM leaderboard_career_renown_facts LIMIT 1) THEN
        RAISE EXCEPTION 'migration 370 rollback requires offline variant deduplication and index preparation';
    END IF;
END
$migration$;
ALTER TABLE leaderboard_career_renown_facts
    DROP CONSTRAINT leaderboard_career_renown_facts_pkey,
    ADD CONSTRAINT leaderboard_career_renown_facts_pkey PRIMARY KEY
      (tenant_id, run_id, encounter_name, realm_id, player_guid, player_class, player_spec, player_sub_spec);
DROP INDEX idx_edr_boss_variant_unique;
CREATE UNIQUE INDEX idx_edr_boss_canonical_unique ON encounter_dps_rankings
    (instance_id, player_guid, encounter_name) WHERE encounter_id IS NOT NULL;
ALTER TABLE parse_score_memberships
    DROP CONSTRAINT parse_score_memberships_variant_key,
    ADD CONSTRAINT parse_score_memberships_tenant_id_policy_version_query_vers_key
      UNIQUE (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid);
ALTER TABLE time_parse_boss_kill_memberships
    DROP CONSTRAINT time_parse_boss_kill_memberships_variant_key,
    ADD CONSTRAINT time_parse_boss_kill_membersh_tenant_id_policy_version_quer_key
      UNIQUE (tenant_id, policy_version, query_version, run_id, encounter_name);



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
