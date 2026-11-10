BEGIN;

-- Reviewed default ranking sets from complete Crusader Storm raid uploads.
-- These use the existing implicit TBC difficulty tuple ('', 0); no speedrun,
-- difficulty, or career-average policy is introduced here.
INSERT INTO leaderboard_sets (instance_name, set_key, name) VALUES
    ('Hyjal Summit', 'default', 'Normal'),
    ('Zul''Aman', 'default', 'Normal');

INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name) VALUES
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
    ('Zul''Aman', 'default', 'Zul''jin');

INSERT INTO leaderboard_set_overrides (layer_key, instance_name, set_key, enabled) VALUES
    ('tbc', 'Hyjal Summit', 'default', true),
    ('tbc', 'Zul''Aman', 'default', true);

INSERT INTO leaderboard_member_overrides
    (layer_key, instance_name, set_key, encounter_name, enabled, position)
VALUES
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
    ('tbc', 'Zul''Aman', 'default', 'Zul''jin', true, 6);

COMMIT;
