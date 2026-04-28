-- name: ListWorldInstanceScripts :many
SELECT map, parent, script
FROM world_instance_script
ORDER BY map;

-- name: ListWorldBossCredits :many
SELECT entry, credit_type, credit_entry, last_encounter_dungeon, comment
FROM world_boss_credit
ORDER BY entry;

-- name: ListWorldInstanceSpawnEntries :many
WITH entries AS (
  SELECT map, id AS entry_id FROM world_creature_spawn WHERE id <> 0
  UNION
  SELECT map, id2 AS entry_id FROM world_creature_spawn WHERE id2 <> 0
  UNION
  SELECT map, id3 AS entry_id FROM world_creature_spawn WHERE id3 <> 0
  UNION
  SELECT map, id4 AS entry_id FROM world_creature_spawn WHERE id4 <> 0
)
SELECT e.map, e.entry_id, COALESCE(wct.name, 'Unknown') AS name
FROM entries e
LEFT JOIN world_creature_template wct ON wct.entry = e.entry_id
ORDER BY e.map, e.entry_id;