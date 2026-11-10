BEGIN;

-- Delete only the exact values introduced by the up migration, in reverse FK
-- order. Changed or subsequently referenced rows remain protected.
DELETE FROM leaderboard_career_variants WHERE (instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown) IN (VALUES
    ('Black Temple', '', 0, ARRAY['tbc']::text[], false, true),
    ('Hyjal Summit', '', 0, ARRAY['tbc']::text[], false, true),
    ('Karazhan', '', 0, ARRAY['tbc']::text[], false, true),
    ('Magtheridon''s Lair', '', 0, ARRAY['tbc']::text[], false, true),
    ('Sunwell Plateau', '', 0, ARRAY['tbc']::text[], false, true),
    ('Zul''Aman', '', 0, ARRAY['tbc']::text[], false, true));

DELETE FROM leaderboard_boss_renown WHERE layer_key = 'tbc' AND (instance_name, encounter_name, points) IN (VALUES
    ('Black Temple', 'Gurtogg Bloodboil', 3),
    ('Black Temple', 'High Warlord Naj''entus', 3),
    ('Black Temple', 'Illidan Stormrage', 8),
    ('Black Temple', 'Mother Shahraz', 3),
    ('Black Temple', 'Reliquary of Souls', 3),
    ('Black Temple', 'Shade of Akama', 3),
    ('Black Temple', 'Supremus', 3),
    ('Black Temple', 'Teron Gorefiend', 3),
    ('Black Temple', 'The Illidari Council', 3),
    ('Gruul''s Lair', 'Gruul the Dragonkiller', 3),
    ('Gruul''s Lair', 'High King Maulgar', 1),
    ('Hyjal Summit', 'Anetheron', 3),
    ('Hyjal Summit', 'Archimonde', 7),
    ('Hyjal Summit', 'Azgalor', 3),
    ('Hyjal Summit', 'Kaz''rogal', 3),
    ('Hyjal Summit', 'Rage Winterchill', 3),
    ('Karazhan', 'Attumen the Huntsman', 1),
    ('Karazhan', 'Echo of Medivh', 1),
    ('Karazhan', 'Maiden of Virtue', 1),
    ('Karazhan', 'Moroes', 1),
    ('Karazhan', 'Netherspite', 1),
    ('Karazhan', 'Nightbane', 3),
    ('Karazhan', 'Prince Malchezaar', 3),
    ('Karazhan', 'Shade of Aran', 1),
    ('Karazhan', 'Terestian Illhoof', 1),
    ('Karazhan', 'The Curator', 1),
    ('Magtheridon''s Lair', 'Magtheridon', 3),
    ('Serpentshrine Cavern', 'Fathom-Lord Karathress', 2),
    ('Serpentshrine Cavern', 'Hydross the Unstable', 2),
    ('Serpentshrine Cavern', 'Lady Vashj', 6),
    ('Serpentshrine Cavern', 'Leotheras the Blind', 2),
    ('Serpentshrine Cavern', 'Morogrim Tidewalker', 2),
    ('Serpentshrine Cavern', 'The Lurker Below', 2),
    ('Sunwell Plateau', 'Brutallus', 8),
    ('Sunwell Plateau', 'Felmyst', 8),
    ('Sunwell Plateau', 'Kalecgos', 8),
    ('Sunwell Plateau', 'M''uru', 12),
    ('Tempest Keep', 'Al''ar', 2),
    ('Tempest Keep', 'High Astromancer Solarian', 2),
    ('Tempest Keep', 'Kael''thas Sunstrider', 6),
    ('Tempest Keep', 'Void Reaver', 2),
    ('Zul''Aman', 'Akil''zon', 1),
    ('Zul''Aman', 'Halazzi', 1),
    ('Zul''Aman', 'Hex Lord Malacrass', 1),
    ('Zul''Aman', 'Jan''alai', 1),
    ('Zul''Aman', 'Nalorakk', 1),
    ('Zul''Aman', 'Zul''jin', 3));

DELETE FROM leaderboard_boss_overrides
WHERE layer_key = 'tbc' AND enabled = true AND (
    (instance_name = 'Black Temple' AND encounter_name IN ('Gurtogg Bloodboil', 'High Warlord Naj''entus', 'Illidan Stormrage', 'Mother Shahraz', 'Reliquary of Souls', 'Shade of Akama', 'Supremus', 'Teron Gorefiend', 'The Illidari Council')) OR
    (instance_name = 'Hyjal Summit' AND encounter_name IN ('Anetheron', 'Archimonde', 'Azgalor', 'Kaz''rogal', 'Rage Winterchill')) OR
    (instance_name = 'Karazhan' AND encounter_name IN ('Attumen the Huntsman', 'Echo of Medivh', 'Maiden of Virtue', 'Moroes', 'Netherspite', 'Nightbane', 'Prince Malchezaar', 'Shade of Aran', 'Terestian Illhoof', 'The Curator')) OR
    (instance_name = 'Magtheridon''s Lair' AND encounter_name = 'Magtheridon') OR
    (instance_name = 'Sunwell Plateau' AND encounter_name IN ('Brutallus', 'Felmyst', 'Kalecgos', 'M''uru')) OR
    (instance_name = 'Zul''Aman' AND encounter_name IN ('Akil''zon', 'Halazzi', 'Hex Lord Malacrass', 'Jan''alai', 'Nalorakk', 'Zul''jin'))
);

DELETE FROM leaderboard_instance_overrides WHERE (layer_key, instance_name, enabled) IN (VALUES
    ('tbc', 'Black Temple', true),
    ('tbc', 'Hyjal Summit', true),
    ('tbc', 'Karazhan', true),
    ('tbc', 'Magtheridon''s Lair', true),
    ('tbc', 'Sunwell Plateau', true),
    ('tbc', 'Zul''Aman', true));

DELETE FROM leaderboard_bosses WHERE
    (instance_name = 'Black Temple' AND encounter_name IN ('Gurtogg Bloodboil', 'High Warlord Naj''entus', 'Illidan Stormrage', 'Mother Shahraz', 'Reliquary of Souls', 'Shade of Akama', 'Supremus', 'Teron Gorefiend', 'The Illidari Council')) OR
    (instance_name = 'Hyjal Summit' AND encounter_name IN ('Anetheron', 'Archimonde', 'Azgalor', 'Kaz''rogal', 'Rage Winterchill')) OR
    (instance_name = 'Karazhan' AND encounter_name IN ('Attumen the Huntsman', 'Echo of Medivh', 'Maiden of Virtue', 'Moroes', 'Netherspite', 'Nightbane', 'Prince Malchezaar', 'Shade of Aran', 'Terestian Illhoof', 'The Curator')) OR
    (instance_name = 'Magtheridon''s Lair' AND encounter_name = 'Magtheridon') OR
    (instance_name = 'Sunwell Plateau' AND encounter_name IN ('Brutallus', 'Felmyst', 'Kalecgos', 'M''uru')) OR
    (instance_name = 'Zul''Aman' AND encounter_name IN ('Akil''zon', 'Halazzi', 'Hex Lord Malacrass', 'Jan''alai', 'Nalorakk', 'Zul''jin'));

DELETE FROM leaderboard_instances WHERE instance_name IN
    ('Black Temple', 'Hyjal Summit', 'Karazhan', 'Magtheridon''s Lair', 'Sunwell Plateau', 'Zul''Aman');

COMMIT;
