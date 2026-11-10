BEGIN;

-- Reviewed TBC awards. Gruul, SSC, and TK already have ranked progression
-- sets. The remaining raids are enabled for boss Renown only: no sets,
-- variants, or ranked-average configuration are inferred.

INSERT INTO leaderboard_instances (instance_name) VALUES
    ('Black Temple'),
    ('Hyjal Summit'),
    ('Karazhan'),
    ('Magtheridon''s Lair'),
    ('Sunwell Plateau'),
    ('Zul''Aman');

INSERT INTO leaderboard_bosses (instance_name, encounter_name) VALUES
    ('Black Temple', 'Gurtogg Bloodboil'),
    ('Black Temple', 'High Warlord Naj''entus'),
    ('Black Temple', 'Illidan Stormrage'),
    ('Black Temple', 'Mother Shahraz'),
    ('Black Temple', 'Reliquary of Souls'),
    ('Black Temple', 'Shade of Akama'),
    ('Black Temple', 'Supremus'),
    ('Black Temple', 'Teron Gorefiend'),
    ('Black Temple', 'The Illidari Council'),
    ('Hyjal Summit', 'Anetheron'),
    ('Hyjal Summit', 'Archimonde'),
    ('Hyjal Summit', 'Azgalor'),
    ('Hyjal Summit', 'Kaz''rogal'),
    ('Hyjal Summit', 'Rage Winterchill'),
    ('Karazhan', 'Attumen the Huntsman'),
    ('Karazhan', 'Echo of Medivh'),
    ('Karazhan', 'Maiden of Virtue'),
    ('Karazhan', 'Moroes'),
    ('Karazhan', 'Netherspite'),
    ('Karazhan', 'Nightbane'),
    ('Karazhan', 'Prince Malchezaar'),
    ('Karazhan', 'Shade of Aran'),
    ('Karazhan', 'Terestian Illhoof'),
    ('Karazhan', 'The Curator'),
    ('Magtheridon''s Lair', 'Magtheridon'),
    ('Sunwell Plateau', 'Brutallus'),
    ('Sunwell Plateau', 'Felmyst'),
    ('Sunwell Plateau', 'Kalecgos'),
    ('Sunwell Plateau', 'M''uru'),
    ('Zul''Aman', 'Akil''zon'),
    ('Zul''Aman', 'Halazzi'),
    ('Zul''Aman', 'Hex Lord Malacrass'),
    ('Zul''Aman', 'Jan''alai'),
    ('Zul''Aman', 'Nalorakk'),
    ('Zul''Aman', 'Zul''jin');

INSERT INTO leaderboard_instance_overrides (layer_key, instance_name, enabled) VALUES
    ('tbc', 'Black Temple', true),
    ('tbc', 'Hyjal Summit', true),
    ('tbc', 'Karazhan', true),
    ('tbc', 'Magtheridon''s Lair', true),
    ('tbc', 'Sunwell Plateau', true),
    ('tbc', 'Zul''Aman', true);

INSERT INTO leaderboard_boss_overrides (layer_key, instance_name, encounter_name, enabled)
SELECT 'tbc', instance_name, encounter_name, true
FROM leaderboard_bosses
WHERE instance_name IN ('Black Temple', 'Hyjal Summit', 'Karazhan', 'Magtheridon''s Lair', 'Sunwell Plateau', 'Zul''Aman');

INSERT INTO leaderboard_boss_renown (layer_key, instance_name, encounter_name, points) VALUES
    ('tbc', 'Black Temple', 'Gurtogg Bloodboil', 3),
    ('tbc', 'Black Temple', 'High Warlord Naj''entus', 3),
    ('tbc', 'Black Temple', 'Illidan Stormrage', 8),
    ('tbc', 'Black Temple', 'Mother Shahraz', 3),
    ('tbc', 'Black Temple', 'Reliquary of Souls', 3),
    ('tbc', 'Black Temple', 'Shade of Akama', 3),
    ('tbc', 'Black Temple', 'Supremus', 3),
    ('tbc', 'Black Temple', 'Teron Gorefiend', 3),
    ('tbc', 'Black Temple', 'The Illidari Council', 3),
    ('tbc', 'Gruul''s Lair', 'Gruul the Dragonkiller', 3),
    ('tbc', 'Gruul''s Lair', 'High King Maulgar', 1),
    ('tbc', 'Hyjal Summit', 'Anetheron', 3),
    ('tbc', 'Hyjal Summit', 'Archimonde', 7),
    ('tbc', 'Hyjal Summit', 'Azgalor', 3),
    ('tbc', 'Hyjal Summit', 'Kaz''rogal', 3),
    ('tbc', 'Hyjal Summit', 'Rage Winterchill', 3),
    ('tbc', 'Karazhan', 'Attumen the Huntsman', 1),
    ('tbc', 'Karazhan', 'Echo of Medivh', 1),
    ('tbc', 'Karazhan', 'Maiden of Virtue', 1),
    ('tbc', 'Karazhan', 'Moroes', 1),
    ('tbc', 'Karazhan', 'Netherspite', 1),
    ('tbc', 'Karazhan', 'Nightbane', 3),
    ('tbc', 'Karazhan', 'Prince Malchezaar', 3),
    ('tbc', 'Karazhan', 'Shade of Aran', 1),
    ('tbc', 'Karazhan', 'Terestian Illhoof', 1),
    ('tbc', 'Karazhan', 'The Curator', 1),
    ('tbc', 'Magtheridon''s Lair', 'Magtheridon', 3),
    ('tbc', 'Serpentshrine Cavern', 'Fathom-Lord Karathress', 2),
    ('tbc', 'Serpentshrine Cavern', 'Hydross the Unstable', 2),
    ('tbc', 'Serpentshrine Cavern', 'Lady Vashj', 6),
    ('tbc', 'Serpentshrine Cavern', 'Leotheras the Blind', 2),
    ('tbc', 'Serpentshrine Cavern', 'Morogrim Tidewalker', 2),
    ('tbc', 'Serpentshrine Cavern', 'The Lurker Below', 2),
    ('tbc', 'Sunwell Plateau', 'Brutallus', 8),
    ('tbc', 'Sunwell Plateau', 'Felmyst', 8),
    ('tbc', 'Sunwell Plateau', 'Kalecgos', 8),
    ('tbc', 'Sunwell Plateau', 'M''uru', 12),
    ('tbc', 'Tempest Keep', 'Al''ar', 2),
    ('tbc', 'Tempest Keep', 'High Astromancer Solarian', 2),
    ('tbc', 'Tempest Keep', 'Kael''thas Sunstrider', 6),
    ('tbc', 'Tempest Keep', 'Void Reaver', 2),
    ('tbc', 'Zul''Aman', 'Akil''zon', 1),
    ('tbc', 'Zul''Aman', 'Halazzi', 1),
    ('tbc', 'Zul''Aman', 'Hex Lord Malacrass', 1),
    ('tbc', 'Zul''Aman', 'Jan''alai', 1),
    ('tbc', 'Zul''Aman', 'Nalorakk', 1),
    ('tbc', 'Zul''Aman', 'Zul''jin', 3);

-- Renown-only career entries expose these raids without treating their boss
-- lists as approved ranked-average progression sets.
INSERT INTO leaderboard_career_variants
    (instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown)
VALUES
    ('Black Temple', '', 0, ARRAY['tbc'], false, true),
    ('Hyjal Summit', '', 0, ARRAY['tbc'], false, true),
    ('Karazhan', '', 0, ARRAY['tbc'], false, true),
    ('Magtheridon''s Lair', '', 0, ARRAY['tbc'], false, true),
    ('Sunwell Plateau', '', 0, ARRAY['tbc'], false, true),
    ('Zul''Aman', '', 0, ARRAY['tbc'], false, true);

COMMIT;
