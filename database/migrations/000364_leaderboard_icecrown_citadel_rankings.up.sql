BEGIN;

-- Enable reviewed ICC boss rankings for the English 10/25-player cohorts and
-- the Russian 10-player cohort observed in Warmane logs. Career weights and
-- Renown remain intentionally unconfigured until separately calibrated.
INSERT INTO leaderboard_instances (instance_name) VALUES
    ('Icecrown Citadel');

INSERT INTO leaderboard_instance_variants (instance_name, difficulty_name, max_players) VALUES
    ('Icecrown Citadel', '10 Player', 10),
    ('Icecrown Citadel', '25 Player', 25),
    ('Icecrown Citadel', '10 игроков', 10);

INSERT INTO leaderboard_bosses (instance_name, encounter_name) VALUES
    ('Icecrown Citadel', 'Lord Marrowgar'),
    ('Icecrown Citadel', 'Lady Deathwhisper'),
    ('Icecrown Citadel', 'Gunship Battle'),
    ('Icecrown Citadel', 'Deathbringer Saurfang'),
    ('Icecrown Citadel', 'Festergut'),
    ('Icecrown Citadel', 'Rotface'),
    ('Icecrown Citadel', 'Professor Putricide'),
    ('Icecrown Citadel', 'Blood Council'),
    ('Icecrown Citadel', 'Blood-Queen Lana''thel'),
    ('Icecrown Citadel', 'Valithria Dreamwalker'),
    ('Icecrown Citadel', 'Sindragosa'),
    ('Icecrown Citadel', 'The Lich King');

INSERT INTO leaderboard_sets (instance_name, set_key, name) VALUES
    ('Icecrown Citadel', 'default', 'Normal');

INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name) VALUES
    ('Icecrown Citadel', 'default', 'Lord Marrowgar'),
    ('Icecrown Citadel', 'default', 'Lady Deathwhisper'),
    ('Icecrown Citadel', 'default', 'Gunship Battle'),
    ('Icecrown Citadel', 'default', 'Deathbringer Saurfang'),
    ('Icecrown Citadel', 'default', 'Festergut'),
    ('Icecrown Citadel', 'default', 'Rotface'),
    ('Icecrown Citadel', 'default', 'Professor Putricide'),
    ('Icecrown Citadel', 'default', 'Blood Council'),
    ('Icecrown Citadel', 'default', 'Blood-Queen Lana''thel'),
    ('Icecrown Citadel', 'default', 'Valithria Dreamwalker'),
    ('Icecrown Citadel', 'default', 'Sindragosa'),
    ('Icecrown Citadel', 'default', 'The Lich King');

INSERT INTO leaderboard_instance_overrides (layer_key, instance_name, enabled) VALUES
    ('wrath', 'Icecrown Citadel', true);

INSERT INTO leaderboard_variant_overrides (layer_key, instance_name, difficulty_name, max_players, enabled) VALUES
    ('wrath', 'Icecrown Citadel', '10 Player', 10, true),
    ('wrath', 'Icecrown Citadel', '25 Player', 25, true),
    ('wrath', 'Icecrown Citadel', '10 игроков', 10, true);

INSERT INTO leaderboard_boss_overrides (layer_key, instance_name, encounter_name, enabled)
SELECT 'wrath', instance_name, encounter_name, true
FROM leaderboard_bosses
WHERE instance_name = 'Icecrown Citadel';

INSERT INTO leaderboard_set_overrides (layer_key, instance_name, set_key, enabled) VALUES
    ('wrath', 'Icecrown Citadel', 'default', true);

INSERT INTO leaderboard_member_overrides
    (layer_key, instance_name, set_key, encounter_name, enabled, position)
VALUES
    ('wrath', 'Icecrown Citadel', 'default', 'Lord Marrowgar', true, 1),
    ('wrath', 'Icecrown Citadel', 'default', 'Lady Deathwhisper', true, 2),
    ('wrath', 'Icecrown Citadel', 'default', 'Gunship Battle', true, 3),
    ('wrath', 'Icecrown Citadel', 'default', 'Deathbringer Saurfang', true, 4),
    ('wrath', 'Icecrown Citadel', 'default', 'Festergut', true, 5),
    ('wrath', 'Icecrown Citadel', 'default', 'Rotface', true, 6),
    ('wrath', 'Icecrown Citadel', 'default', 'Professor Putricide', true, 7),
    ('wrath', 'Icecrown Citadel', 'default', 'Blood Council', true, 8),
    ('wrath', 'Icecrown Citadel', 'default', 'Blood-Queen Lana''thel', true, 9),
    ('wrath', 'Icecrown Citadel', 'default', 'Valithria Dreamwalker', true, 10),
    ('wrath', 'Icecrown Citadel', 'default', 'Sindragosa', true, 11),
    ('wrath', 'Icecrown Citadel', 'default', 'The Lich King', true, 12);

COMMIT;
