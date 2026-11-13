BEGIN;

DELETE FROM leaderboard_member_overrides WHERE
    (layer_key, instance_name, set_key, encounter_name, enabled, position) IN (VALUES
        ('tbc', 'Karazhan', 'default', 'Attumen the Huntsman', true, 1),
        ('tbc', 'Karazhan', 'default', 'Moroes', true, 2),
        ('tbc', 'Karazhan', 'default', 'Maiden of Virtue', true, 3),
        ('tbc', 'Karazhan', 'default', 'Nightbane', true, 4),
        ('tbc', 'Karazhan', 'default', 'The Curator', true, 5),
        ('tbc', 'Karazhan', 'default', 'Terestian Illhoof', true, 6),
        ('tbc', 'Karazhan', 'default', 'Shade of Aran', true, 7),
        ('tbc', 'Karazhan', 'default', 'Netherspite', true, 8),
        ('tbc', 'Karazhan', 'default', 'Prince Malchezaar', true, 9));

DELETE FROM leaderboard_set_overrides WHERE
    (layer_key, instance_name, set_key, enabled) IN (VALUES
        ('tbc', 'Karazhan', 'default', true));

DELETE FROM leaderboard_set_members WHERE
    (instance_name, set_key, encounter_name) IN (VALUES
        ('Karazhan', 'default', 'Attumen the Huntsman'),
        ('Karazhan', 'default', 'Moroes'),
        ('Karazhan', 'default', 'Maiden of Virtue'),
        ('Karazhan', 'default', 'Nightbane'),
        ('Karazhan', 'default', 'The Curator'),
        ('Karazhan', 'default', 'Terestian Illhoof'),
        ('Karazhan', 'default', 'Shade of Aran'),
        ('Karazhan', 'default', 'Netherspite'),
        ('Karazhan', 'default', 'Prince Malchezaar'));

DELETE FROM leaderboard_sets WHERE
    (instance_name, set_key, name) IN (VALUES
        ('Karazhan', 'default', 'Normal'));

COMMIT;
