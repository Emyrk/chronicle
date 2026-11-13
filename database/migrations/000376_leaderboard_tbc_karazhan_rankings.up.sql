BEGIN;

-- Reviewed Karazhan ranking set from the complete Crusader Storm upload
-- Um_q1dByeFC4e6F1. The raid recorded nine clean boss kills; Opera and chess
-- are not required because this server's completed run did not emit canonical
-- boss kills for either event. Career-average weighting remains unchanged.
INSERT INTO leaderboard_sets (instance_name, set_key, name) VALUES
    ('Karazhan', 'default', 'Normal');

INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name) VALUES
    ('Karazhan', 'default', 'Attumen the Huntsman'),
    ('Karazhan', 'default', 'Moroes'),
    ('Karazhan', 'default', 'Maiden of Virtue'),
    ('Karazhan', 'default', 'Nightbane'),
    ('Karazhan', 'default', 'The Curator'),
    ('Karazhan', 'default', 'Terestian Illhoof'),
    ('Karazhan', 'default', 'Shade of Aran'),
    ('Karazhan', 'default', 'Netherspite'),
    ('Karazhan', 'default', 'Prince Malchezaar');

INSERT INTO leaderboard_set_overrides (layer_key, instance_name, set_key, enabled) VALUES
    ('tbc', 'Karazhan', 'default', true);

INSERT INTO leaderboard_member_overrides
    (layer_key, instance_name, set_key, encounter_name, enabled, position)
VALUES
    ('tbc', 'Karazhan', 'default', 'Attumen the Huntsman', true, 1),
    ('tbc', 'Karazhan', 'default', 'Moroes', true, 2),
    ('tbc', 'Karazhan', 'default', 'Maiden of Virtue', true, 3),
    ('tbc', 'Karazhan', 'default', 'Nightbane', true, 4),
    ('tbc', 'Karazhan', 'default', 'The Curator', true, 5),
    ('tbc', 'Karazhan', 'default', 'Terestian Illhoof', true, 6),
    ('tbc', 'Karazhan', 'default', 'Shade of Aran', true, 7),
    ('tbc', 'Karazhan', 'default', 'Netherspite', true, 8),
    ('tbc', 'Karazhan', 'default', 'Prince Malchezaar', true, 9);

COMMIT;
