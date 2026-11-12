BEGIN;

-- Draft 369 must not have served ingestion before this replacement contract.
-- Refuse rather than silently discard any draft-format encounter evidence.
DO $draft_guard$
BEGIN
    IF EXISTS (SELECT 1 FROM log_instance_difficulties LIMIT 1) THEN
        RAISE EXCEPTION 'migration 370 found populated draft-369 difficulty data; preserve it with an operator-reviewed conversion before deployment';
    END IF;
END
$draft_guard$;

-- Do not build indexes on populated tables during service startup. Production
-- must first run the separately approved concurrent preparation script. Empty
-- test/new installations can create these indexes without scanning user data.
DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('idx_edr_boss_variant_unique') AND indisvalid AND indisunique) THEN
        IF EXISTS (SELECT 1 FROM encounter_dps_rankings LIMIT 1) THEN
            RAISE EXCEPTION 'migration 370 requires prebuilt valid index idx_edr_boss_variant_unique; run approved migrations/offline/000370_prepare_variant_indexes.sql before deployment';
        END IF;
        EXECUTE 'CREATE UNIQUE INDEX idx_edr_boss_variant_unique ON encounter_dps_rankings (instance_id, player_guid, encounter_name, difficulty_name, max_players) WHERE encounter_id IS NOT NULL';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('parse_score_memberships_variant_key') AND indisvalid AND indisunique) THEN
        IF EXISTS (SELECT 1 FROM parse_score_memberships LIMIT 1) THEN
            RAISE EXCEPTION 'migration 370 requires prebuilt valid index parse_score_memberships_variant_key; run approved migrations/offline/000370_prepare_variant_indexes.sql before deployment';
        END IF;
        EXECUTE 'CREATE UNIQUE INDEX parse_score_memberships_variant_key ON parse_score_memberships (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid, difficulty_name, max_players)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('time_parse_boss_kill_memberships_variant_key') AND indisvalid AND indisunique) THEN
        IF EXISTS (SELECT 1 FROM time_parse_boss_kill_memberships LIMIT 1) THEN
            RAISE EXCEPTION 'migration 370 requires prebuilt valid index time_parse_boss_kill_memberships_variant_key; run approved migrations/offline/000370_prepare_variant_indexes.sql before deployment';
        END IF;
        EXECUTE 'CREATE UNIQUE INDEX time_parse_boss_kill_memberships_variant_key ON time_parse_boss_kill_memberships (tenant_id, policy_version, query_version, run_id, encounter_name, difficulty_name, max_players)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('leaderboard_career_renown_facts_variant_key') AND indisvalid AND indisunique) THEN
        IF EXISTS (SELECT 1 FROM leaderboard_career_renown_facts LIMIT 1) THEN
            RAISE EXCEPTION 'migration 370 requires prebuilt valid index leaderboard_career_renown_facts_variant_key; run approved offline preparation';
        END IF;
        EXECUTE 'CREATE UNIQUE INDEX leaderboard_career_renown_facts_variant_key ON leaderboard_career_renown_facts (tenant_id, run_id, encounter_name, realm_id, player_guid, player_class, player_spec, player_sub_spec, difficulty_name, max_players)';
    END IF;
END
$migration$;
ALTER TABLE leaderboard_career_renown_facts
    DROP CONSTRAINT leaderboard_career_renown_facts_pkey,
    ADD CONSTRAINT leaderboard_career_renown_facts_pkey PRIMARY KEY USING INDEX leaderboard_career_renown_facts_variant_key;
DROP INDEX idx_edr_boss_canonical_unique;
ALTER TABLE parse_score_memberships
    DROP CONSTRAINT parse_score_memberships_tenant_id_policy_version_query_vers_key,
    ADD CONSTRAINT parse_score_memberships_variant_key UNIQUE USING INDEX parse_score_memberships_variant_key;
ALTER TABLE time_parse_boss_kill_memberships
    DROP CONSTRAINT time_parse_boss_kill_membersh_tenant_id_policy_version_quer_key,
    ADD CONSTRAINT time_parse_boss_kill_memberships_variant_key UNIQUE USING INDEX time_parse_boss_kill_memberships_variant_key;



-- NULL identifies a legacy encounter. Empty text is explicitly Normal and must
-- never inherit a heroic parent. Adding a nullable column does not rewrite rows.
ALTER TABLE log_instance_encounters
    ADD COLUMN difficulty text,
    DROP COLUMN difficulty_name,
    DROP COLUMN max_players,
    DROP COLUMN dynamic_difficulty;

-- The guard above ensures this draft-format summary is empty.
-- Reads derive the observed set from all encounters.
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
    li.mixed_difficulty,
    li.difficulty_normalized
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
LEFT JOIN log_instance_encounters encounter ON encounter.id = ranking.encounter_id
-- New canonical rows must agree with the encounter. Legacy rows have only the
-- parent log assumption; do not reinterpret a corrupt new ranking as valid.
WHERE NOT instance.difficulty_normalized OR (
    ranking.difficulty_name = COALESCE(encounter.difficulty, instance.difficulty_name)
    AND ranking.max_players = instance.max_players
);

-- Preserve historic scores while resolving their cohort from the recorded log.
-- This is a read adapter, not a bulk rewrite or an automatic score recalculation.
CREATE VIEW parse_score_results_resolved WITH (security_invoker = true) AS
SELECT
    score.id,
    score.tenant_id,
    score.instance_id,
    score.run_id,
    score.snapshot_id,
    score.log_group_id,
    score.guild_id,
    score.encounter_name,
    score.player_guid,
    score.player_name,
    score.player_class,
    score.player_spec,
    score.player_role,
    score.metric,
    score.metric_value,
    score.precise_score,
    score.display_score,
    score.rank,
    score.sample_size,
    score.status,
    score.instance_name,
    CASE WHEN instance.difficulty_normalized THEN score.difficulty_name ELSE instance.difficulty_name END::text AS difficulty_name,
    instance.max_players::smallint AS max_players,
    score.killed_at,
    score.created_at,
    score.player_sub_spec
FROM parse_score_results score
JOIN log_instances_resolved instance ON instance.id = score.instance_id;

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
