BEGIN;

-- Preview the production impact before deployment with:
--
-- SELECT COUNT(*) AS rows_to_delete
-- FROM (
--     SELECT ROW_NUMBER() OVER (
--         PARTITION BY instance_id, player_guid, encounter_name
--         ORDER BY
--             killed_at DESC,
--             encounter_id DESC,
--             id ASC
--     ) AS occurrence_rank
--     FROM encounter_dps_rankings
--     WHERE encounter_id IS NOT NULL
-- ) ranked
-- WHERE occurrence_rank > 1;
--
-- This cleanup can be run ahead of deployment. The migration repeats it while
-- Chronicle is stopped so rows inserted after the early cleanup are covered.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY instance_id, player_guid, encounter_name
            ORDER BY
                killed_at DESC,
                encounter_id DESC,
                id ASC
        ) AS occurrence_rank
    FROM encounter_dps_rankings
    WHERE encounter_id IS NOT NULL
)
DELETE FROM encounter_dps_rankings edr
USING ranked
WHERE ranked.id = edr.id
  AND ranked.occurrence_rank > 1;

-- Boss rankings now keep the latest timestamped occurrence per player and
-- encounter name in an uploaded instance, preventing repeated raid clears from
-- becoming a synthetic best-of-each-boss run. Trash remains unique per player/spec/sub-spec through
-- idx_edr_trash_unique because a player can respec during a raid.
CREATE UNIQUE INDEX idx_edr_boss_canonical_unique
    ON encounter_dps_rankings (instance_id, player_guid, encounter_name)
    WHERE encounter_id IS NOT NULL;

-- parse_score_memberships is denormalized from ranking rows and has no ranking
-- row foreign key. Synchronize memberships even when the expensive delete was
-- run before deployment and the boot-time cleanup found no remaining duplicates.
UPDATE parse_score_memberships membership
SET
    difficulty_name = ranking.difficulty_name,
    max_players = ranking.max_players,
    player_class = ranking.player_class,
    player_spec = ranking.player_spec,
    player_sub_spec = ranking.player_sub_spec,
    killed_at = ranking.killed_at,
    dps = ranking.dps,
    hps = ranking.hps
FROM encounter_dps_rankings ranking
WHERE ranking.encounter_id IS NOT NULL
  AND ranking.instance_id = membership.instance_id
  AND ranking.encounter_name = membership.encounter_name
  AND ranking.player_guid = membership.player_guid
  AND ROW(
        membership.difficulty_name,
        membership.max_players,
        membership.player_class,
        membership.player_spec,
        membership.player_sub_spec,
        membership.killed_at,
        membership.dps,
        membership.hps
      ) IS DISTINCT FROM ROW(
        ranking.difficulty_name,
        ranking.max_players,
        ranking.player_class,
        ranking.player_spec,
        ranking.player_sub_spec,
        ranking.killed_at,
        ranking.dps,
        ranking.hps
      );

COMMIT;
