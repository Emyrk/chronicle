BEGIN;
-- Metadata-only nullable additions: no default, backfill, index build, or row scan.
-- Existing unknown history remains NULL and participates only in Combined.
ALTER TABLE log_instance_encounters ADD COLUMN encounter_variant text;
ALTER TABLE encounter_dps_rankings ADD COLUMN encounter_variant text;

CREATE OR REPLACE VIEW encounter_dps_rankings_resolved WITH (security_invoker = true) AS
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
    ranking.unranked_damage_done,
    ranking.encounter_variant
FROM encounter_dps_rankings ranking
JOIN log_instances_resolved instance ON instance.id = ranking.instance_id
LEFT JOIN log_instance_encounters encounter ON encounter.id = ranking.encounter_id
-- New canonical rows must agree with the encounter. Legacy rows have only the
-- parent log assumption; do not reinterpret a corrupt new ranking as valid.
WHERE NOT instance.difficulty_normalized OR (
    ranking.difficulty_name = COALESCE(encounter.difficulty, instance.difficulty_name)
    AND ranking.max_players = instance.max_players
);
COMMIT;
