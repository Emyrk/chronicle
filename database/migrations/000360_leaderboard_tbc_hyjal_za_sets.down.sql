BEGIN;

DELETE FROM leaderboard_member_overrides WHERE
    (layer_key, instance_name, set_key, encounter_name, enabled, position) IN (VALUES
        ('tbc', 'Hyjal Summit', 'default', 'Rage Winterchill', true, 1),
        ('tbc', 'Hyjal Summit', 'default', 'Anetheron', true, 2),
        ('tbc', 'Hyjal Summit', 'default', 'Kaz''rogal', true, 3),
        ('tbc', 'Hyjal Summit', 'default', 'Azgalor', true, 4),
        ('tbc', 'Hyjal Summit', 'default', 'Archimonde', true, 5),
        ('tbc', 'Zul''Aman', 'default', 'Akil''zon', true, 1),
        ('tbc', 'Zul''Aman', 'default', 'Nalorakk', true, 2),
        ('tbc', 'Zul''Aman', 'default', 'Jan''alai', true, 3),
        ('tbc', 'Zul''Aman', 'default', 'Halazzi', true, 4),
        ('tbc', 'Zul''Aman', 'default', 'Hex Lord Malacrass', true, 5),
        ('tbc', 'Zul''Aman', 'default', 'Zul''jin', true, 6));

DELETE FROM leaderboard_set_overrides WHERE
    (layer_key, instance_name, set_key, enabled) IN (VALUES
        ('tbc', 'Hyjal Summit', 'default', true),
        ('tbc', 'Zul''Aman', 'default', true));

DELETE FROM leaderboard_set_members WHERE
    (instance_name, set_key, encounter_name) IN (VALUES
        ('Hyjal Summit', 'default', 'Rage Winterchill'),
        ('Hyjal Summit', 'default', 'Anetheron'),
        ('Hyjal Summit', 'default', 'Kaz''rogal'),
        ('Hyjal Summit', 'default', 'Azgalor'),
        ('Hyjal Summit', 'default', 'Archimonde'),
        ('Zul''Aman', 'default', 'Akil''zon'),
        ('Zul''Aman', 'default', 'Nalorakk'),
        ('Zul''Aman', 'default', 'Jan''alai'),
        ('Zul''Aman', 'default', 'Halazzi'),
        ('Zul''Aman', 'default', 'Hex Lord Malacrass'),
        ('Zul''Aman', 'default', 'Zul''jin'));

DELETE FROM leaderboard_sets WHERE
    (instance_name, set_key, name) IN (VALUES
        ('Hyjal Summit', 'default', 'Normal'),
        ('Zul''Aman', 'default', 'Normal'));

COMMIT;
