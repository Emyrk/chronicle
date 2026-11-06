-- name: ResolveLeaderboardConfiguration :many
-- Strict set inclusion, not tag count, determines precedence independently for
-- each assigned property. NULL properties never enter the assignment relation.
WITH assignments AS (
SELECT layer_key, ARRAY['instance', instance_name]::text[] AS identity, 'enabled'::text AS property, enabled::integer::double precision AS value FROM leaderboard_instance_overrides WHERE enabled IS NOT NULL
UNION ALL
SELECT layer_key, ARRAY['variant', instance_name, difficulty_name, max_players::text]::text[] AS identity, 'enabled'::text AS property, enabled::integer::double precision AS value FROM leaderboard_variant_overrides WHERE enabled IS NOT NULL
UNION ALL
SELECT layer_key, ARRAY['boss', instance_name, encounter_name]::text[] AS identity, 'enabled'::text AS property, enabled::integer::double precision AS value FROM leaderboard_boss_overrides WHERE enabled IS NOT NULL
UNION ALL
SELECT layer_key, ARRAY['set', instance_name, set_key]::text[] AS identity, 'enabled'::text AS property, enabled::integer::double precision AS value FROM leaderboard_set_overrides WHERE enabled IS NOT NULL
UNION ALL
SELECT layer_key, ARRAY['member', instance_name, set_key, encounter_name]::text[] AS identity, 'enabled'::text AS property, enabled::integer::double precision AS value FROM leaderboard_member_overrides WHERE enabled IS NOT NULL
UNION ALL
SELECT layer_key, ARRAY['member', instance_name, set_key, encounter_name]::text[] AS identity, 'position'::text AS property, position::double precision AS value FROM leaderboard_member_overrides WHERE position IS NOT NULL
UNION ALL
SELECT layer_key, ARRAY['boss', instance_name, encounter_name]::text[] AS identity, 'points'::text AS property, points::double precision AS value FROM leaderboard_boss_renown
UNION ALL
SELECT layer_key, ARRAY['boss_variant', instance_name, encounter_name, difficulty_name, max_players::text]::text[] AS identity, 'points'::text AS property, points::double precision AS value FROM leaderboard_variant_renown
), applicable AS (
 SELECT a.*, l.required_flavors FROM assignments a
 JOIN leaderboard_layers l ON l.key = a.layer_key
 WHERE l.required_flavors <@ COALESCE(@flavors::text[], '{}'::text[])
), maximal AS (
 SELECT a.* FROM applicable a
 WHERE NOT EXISTS (
  SELECT 1 FROM applicable b
  WHERE b.identity = a.identity AND b.property = a.property
    AND b.required_flavors @> a.required_flavors
    AND b.required_flavors <> a.required_flavors
 )
), resolved AS (
 SELECT identity, property, min(value) AS value, min(value) <> max(value) AS conflict
 FROM maximal GROUP BY identity, property
), enabled AS (
 SELECT identity FROM resolved WHERE property = 'enabled' AND value = 1
), instances AS (
 SELECT i.* FROM leaderboard_instances i
 JOIN enabled e ON e.identity = ARRAY['instance', i.instance_name]
), variants AS (
 SELECT v.* FROM leaderboard_instance_variants v JOIN instances i USING (instance_name)
 JOIN enabled e ON e.identity = ARRAY['variant', v.instance_name, v.difficulty_name, v.max_players::text]
), bosses AS (
 SELECT b.*, r.value AS points FROM leaderboard_bosses b JOIN instances i USING (instance_name)
 JOIN enabled e ON e.identity = ARRAY['boss', b.instance_name, b.encounter_name]
 LEFT JOIN resolved r ON r.identity = ARRAY['boss', b.instance_name, b.encounter_name] AND r.property = 'points'
), sets AS (
 SELECT s.* FROM leaderboard_sets s JOIN instances i USING (instance_name)
 JOIN enabled e ON e.identity = ARRAY['set', s.instance_name, s.set_key]
), members AS (
 SELECT m.*, p.value AS position FROM leaderboard_set_members m
 JOIN sets s USING (instance_name, set_key)
 JOIN bosses b USING (instance_name, encounter_name)
 JOIN enabled e ON e.identity = ARRAY['member', m.instance_name, m.set_key, m.encounter_name]
 LEFT JOIN resolved p ON p.identity = e.identity AND p.property = 'position'
), conflicts AS (
 SELECT identity, property FROM resolved WHERE conflict
 UNION ALL
 -- Enabled memberships must have an explicitly assigned order.
 SELECT ARRAY['member', instance_name, set_key, encounter_name], 'position'
 FROM members WHERE position IS NULL
), output AS (
 SELECT 'instance'::text AS kind, instance_name, ''::text AS encounter_name,
        ''::text AS difficulty_name, 0::smallint AS max_players,
        ''::text AS set_key, NULL::integer AS position,
        NULL::double precision AS points, ''::text AS conflicting_property
 FROM instances
 UNION ALL
 SELECT 'variant', instance_name, '', difficulty_name, max_players, '', NULL, NULL, '' FROM variants
 UNION ALL
 SELECT 'boss', instance_name, encounter_name, '', 0, '', NULL, points, '' FROM bosses
 UNION ALL
 SELECT 'set', instance_name, '', '', 0, set_key, NULL, NULL, '' FROM sets
 UNION ALL
 SELECT 'member', instance_name, encounter_name, '', 0, set_key, position::integer, NULL, '' FROM members
 UNION ALL
 SELECT 'boss_variant', b.instance_name, b.encounter_name, v.difficulty_name, v.max_players,
        '', NULL, COALESCE(r.value, b.points), ''
 FROM bosses b JOIN variants v USING (instance_name)
 LEFT JOIN resolved r ON r.identity = ARRAY['boss_variant', b.instance_name, b.encounter_name, v.difficulty_name, v.max_players::text]
                       AND r.property = 'points'
)
SELECT kind::text, instance_name::text, encounter_name::text, difficulty_name::text,
       max_players::smallint, set_key::text, COALESCE(position, 0)::integer AS position, COALESCE(points, 0)::double precision AS points,
       (points IS NOT NULL)::boolean AS has_points, conflicting_property::text,
       COALESCE((SELECT s.name FROM leaderboard_sets s
                 WHERE output.kind = 'set' AND s.instance_name = output.instance_name
                   AND s.set_key = output.set_key), '')::text AS set_name
FROM output WHERE NOT EXISTS (SELECT 1 FROM conflicts)
UNION ALL
-- A conflict returns diagnostics ONLY, never a partially resolved configuration.
SELECT 'conflict'::text, identity[2]::text, array_to_string(identity, '/')::text,
       ''::text, 0::smallint, ''::text, 0::integer, 0::double precision, false::boolean, property::text, ''::text
FROM conflicts
ORDER BY kind, instance_name, set_key, position, encounter_name, difficulty_name, max_players;
