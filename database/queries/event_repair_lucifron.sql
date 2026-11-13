-- name: LucifronRepairRanking :execrows
-- Only the ranked/unranked split and DPS change. All timing, identity, healing,
-- survival, and other encounter source fields remain untouched.
UPDATE encounter_dps_rankings
SET damage_done = @damage_done, unranked_damage_done = @unranked_damage_done,
    dps = @dps
WHERE id = @id AND instance_id = @instance_id
  AND encounter_id = @encounter_id::uuid
  AND encounter_name = 'Lucifron' AND instance_name = 'Molten Core';
