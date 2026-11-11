BEGIN;

-- Enable reviewed Ruby Sanctum boss rankings for the English 10/25-player
-- cohorts and the Russian 10-player cohort observed in Warmane logs. Career
-- weights and Renown remain intentionally unconfigured until separately calibrated.
INSERT INTO leaderboard_instances (instance_name) VALUES
    ('Ruby Sanctum');

INSERT INTO leaderboard_instance_variants (instance_name, difficulty_name, max_players) VALUES
    ('Ruby Sanctum', '10 Player', 10),
    ('Ruby Sanctum', '25 Player', 25),
    ('Ruby Sanctum', '10 игроков', 10);

INSERT INTO leaderboard_bosses (instance_name, encounter_name) VALUES
    ('Ruby Sanctum', 'Baltharus the Warborn'),
    ('Ruby Sanctum', 'Saviana Ragefire'),
    ('Ruby Sanctum', 'General Zarithrian'),
    ('Ruby Sanctum', 'Halion');

INSERT INTO leaderboard_sets (instance_name, set_key, name) VALUES
    ('Ruby Sanctum', 'default', 'Normal');

INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name) VALUES
    ('Ruby Sanctum', 'default', 'Baltharus the Warborn'),
    ('Ruby Sanctum', 'default', 'Saviana Ragefire'),
    ('Ruby Sanctum', 'default', 'General Zarithrian'),
    ('Ruby Sanctum', 'default', 'Halion');

INSERT INTO leaderboard_instance_overrides (layer_key, instance_name, enabled) VALUES
    ('wrath', 'Ruby Sanctum', true);

INSERT INTO leaderboard_variant_overrides (layer_key, instance_name, difficulty_name, max_players, enabled) VALUES
    ('wrath', 'Ruby Sanctum', '10 Player', 10, true),
    ('wrath', 'Ruby Sanctum', '25 Player', 25, true),
    ('wrath', 'Ruby Sanctum', '10 игроков', 10, true);

INSERT INTO leaderboard_boss_overrides (layer_key, instance_name, encounter_name, enabled)
SELECT 'wrath', instance_name, encounter_name, true
FROM leaderboard_bosses
WHERE instance_name = 'Ruby Sanctum';

INSERT INTO leaderboard_set_overrides (layer_key, instance_name, set_key, enabled) VALUES
    ('wrath', 'Ruby Sanctum', 'default', true);

INSERT INTO leaderboard_member_overrides
    (layer_key, instance_name, set_key, encounter_name, enabled, position)
VALUES
    ('wrath', 'Ruby Sanctum', 'default', 'Baltharus the Warborn', true, 1),
    ('wrath', 'Ruby Sanctum', 'default', 'Saviana Ragefire', true, 2),
    ('wrath', 'Ruby Sanctum', 'default', 'General Zarithrian', true, 3),
    ('wrath', 'Ruby Sanctum', 'default', 'Halion', true, 4);

COMMIT;
