BEGIN;

DELETE FROM leaderboard_member_overrides WHERE
    (layer_key, instance_name, set_key, encounter_name, enabled, position) IN (VALUES
        ('wrath', 'Ruby Sanctum', 'default', 'Baltharus the Warborn', true, 1),
        ('wrath', 'Ruby Sanctum', 'default', 'Saviana Ragefire', true, 2),
        ('wrath', 'Ruby Sanctum', 'default', 'General Zarithrian', true, 3),
        ('wrath', 'Ruby Sanctum', 'default', 'Halion', true, 4));

DELETE FROM leaderboard_set_overrides WHERE
    (layer_key, instance_name, set_key, enabled) = ('wrath', 'Ruby Sanctum', 'default', true);

DELETE FROM leaderboard_boss_overrides WHERE
    (layer_key, instance_name, encounter_name, enabled) IN (VALUES
        ('wrath', 'Ruby Sanctum', 'Baltharus the Warborn', true),
        ('wrath', 'Ruby Sanctum', 'Saviana Ragefire', true),
        ('wrath', 'Ruby Sanctum', 'General Zarithrian', true),
        ('wrath', 'Ruby Sanctum', 'Halion', true));

DELETE FROM leaderboard_variant_overrides WHERE
    (layer_key, instance_name, difficulty_name, max_players, enabled) IN (VALUES
        ('wrath', 'Ruby Sanctum', '10 Player', 10, true),
        ('wrath', 'Ruby Sanctum', '25 Player', 25, true),
        ('wrath', 'Ruby Sanctum', '10 игроков', 10, true));

DELETE FROM leaderboard_instance_overrides WHERE
    (layer_key, instance_name, enabled) = ('wrath', 'Ruby Sanctum', true);

DELETE FROM leaderboard_set_members WHERE
    (instance_name, set_key, encounter_name) IN (VALUES
        ('Ruby Sanctum', 'default', 'Baltharus the Warborn'),
        ('Ruby Sanctum', 'default', 'Saviana Ragefire'),
        ('Ruby Sanctum', 'default', 'General Zarithrian'),
        ('Ruby Sanctum', 'default', 'Halion'));

DELETE FROM leaderboard_sets WHERE
    (instance_name, set_key, name) = ('Ruby Sanctum', 'default', 'Normal');

DELETE FROM leaderboard_bosses WHERE
    (instance_name, encounter_name) IN (VALUES
        ('Ruby Sanctum', 'Baltharus the Warborn'),
        ('Ruby Sanctum', 'Saviana Ragefire'),
        ('Ruby Sanctum', 'General Zarithrian'),
        ('Ruby Sanctum', 'Halion'));

DELETE FROM leaderboard_instance_variants WHERE
    (instance_name, difficulty_name, max_players) IN (VALUES
        ('Ruby Sanctum', '10 Player', 10),
        ('Ruby Sanctum', '25 Player', 25),
        ('Ruby Sanctum', '10 игроков', 10));

DELETE FROM leaderboard_instances WHERE instance_name = 'Ruby Sanctum';

COMMIT;
