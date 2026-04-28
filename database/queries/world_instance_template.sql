-- name: ListWorldInstanceTemplates :many
SELECT id, world_id, name, abbreviation, category, boss_count, background, created_at, updated_at
FROM world_instance_template
ORDER BY name;

-- name: GetWorldInstanceTemplateByZoneName :one
SELECT wit.id, wit.world_id, wit.name, wit.abbreviation, wit.category, wit.boss_count, wit.background, wit.created_at, wit.updated_at
FROM world_instance_template wit
JOIN world_instance_zone_names wizn ON wit.id = wizn.instance_id
WHERE wizn.zone_name = $1;

-- name: UpsertWorldInstanceTemplate :one
INSERT INTO world_instance_template (world_id, name, abbreviation, category, boss_count, background)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (world_id, name) DO UPDATE SET
  abbreviation = EXCLUDED.abbreviation,
  category = EXCLUDED.category,
  boss_count = EXCLUDED.boss_count,
  background = EXCLUDED.background,
  updated_at = NOW()
RETURNING *;

-- name: DeleteWorldInstanceTemplate :exec
DELETE FROM world_instance_template WHERE id = $1;

-- name: GetWorldInstanceZoneNames :many
SELECT *
FROM world_instance_zone_names
WHERE instance_id = $1;

-- name: ListWorldInstanceZoneNames :many
SELECT * FROM world_instance_zone_names;

-- name: DeleteWorldInstanceZoneNames :exec
DELETE FROM world_instance_zone_names WHERE instance_id = $1;

-- name: InsertWorldInstanceZoneName :exec
INSERT INTO world_instance_zone_names (instance_id, zone_name, display_name)
VALUES ($1, $2, $3);

-- name: GetWorldInstanceUnits :many
SELECT wiu.*,
  COALESCE(wiu.override_name, wct.name, 'Unknown') AS name
FROM world_instance_units wiu
LEFT JOIN world_creature_template wct ON wiu.entry_id = wct.entry
WHERE wiu.instance_id = $1;

-- name: ListWorldInstanceUnits :many
SELECT wiu.*,
  COALESCE(wiu.override_name, wct.name, 'Unknown') AS name
FROM world_instance_units wiu
LEFT JOIN world_creature_template wct ON wiu.entry_id = wct.entry;

-- name: UpsertWorldInstanceUnit :exec
INSERT INTO world_instance_units (instance_id, entry_id, override_name, encounter_name, boss, affiliation)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (instance_id, entry_id) DO UPDATE SET
  override_name = EXCLUDED.override_name,
  encounter_name = EXCLUDED.encounter_name,
  boss = EXCLUDED.boss,
  affiliation = EXCLUDED.affiliation;

-- name: DeleteWorldInstanceUnits :exec
DELETE FROM world_instance_units WHERE instance_id = $1;
