BEGIN;

-- Enable the default ranking set for Magtheridon's Lair without adding
-- parser-side speedrun rules. The raid uses the existing implicit TBC
-- difficulty tuple.
INSERT INTO leaderboard_sets (instance_name, set_key, name) VALUES
    ('Magtheridon''s Lair', 'default', 'Normal');

INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name) VALUES
    ('Magtheridon''s Lair', 'default', 'Magtheridon');

INSERT INTO leaderboard_set_overrides (layer_key, instance_name, set_key, enabled) VALUES
    ('tbc', 'Magtheridon''s Lair', 'default', true);

INSERT INTO leaderboard_member_overrides
    (layer_key, instance_name, set_key, encounter_name, enabled, position)
VALUES
    ('tbc', 'Magtheridon''s Lair', 'default', 'Magtheridon', true, 1);

COMMIT;
