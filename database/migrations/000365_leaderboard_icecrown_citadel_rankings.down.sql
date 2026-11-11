BEGIN;

DELETE FROM leaderboard_member_overrides WHERE
    (layer_key, instance_name, set_key, encounter_name, enabled, position) IN (VALUES
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
        ('wrath', 'Icecrown Citadel', 'default', 'The Lich King', true, 12));

DELETE FROM leaderboard_set_overrides WHERE
    (layer_key, instance_name, set_key, enabled) = ('wrath', 'Icecrown Citadel', 'default', true);

DELETE FROM leaderboard_boss_overrides WHERE
    (layer_key, instance_name, encounter_name, enabled) IN (VALUES
        ('wrath', 'Icecrown Citadel', 'Lord Marrowgar', true),
        ('wrath', 'Icecrown Citadel', 'Lady Deathwhisper', true),
        ('wrath', 'Icecrown Citadel', 'Gunship Battle', true),
        ('wrath', 'Icecrown Citadel', 'Deathbringer Saurfang', true),
        ('wrath', 'Icecrown Citadel', 'Festergut', true),
        ('wrath', 'Icecrown Citadel', 'Rotface', true),
        ('wrath', 'Icecrown Citadel', 'Professor Putricide', true),
        ('wrath', 'Icecrown Citadel', 'Blood Council', true),
        ('wrath', 'Icecrown Citadel', 'Blood-Queen Lana''thel', true),
        ('wrath', 'Icecrown Citadel', 'Valithria Dreamwalker', true),
        ('wrath', 'Icecrown Citadel', 'Sindragosa', true),
        ('wrath', 'Icecrown Citadel', 'The Lich King', true));

DELETE FROM leaderboard_variant_overrides WHERE
    (layer_key, instance_name, difficulty_name, max_players, enabled) IN (VALUES
        ('wrath', 'Icecrown Citadel', '10 Player', 10, true),
        ('wrath', 'Icecrown Citadel', '25 Player', 25, true),
        ('wrath', 'Icecrown Citadel', '10 игроков', 10, true));

DELETE FROM leaderboard_instance_overrides WHERE
    (layer_key, instance_name, enabled) = ('wrath', 'Icecrown Citadel', true);

DELETE FROM leaderboard_set_members WHERE
    (instance_name, set_key, encounter_name) IN (VALUES
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
        ('Icecrown Citadel', 'default', 'The Lich King'));

DELETE FROM leaderboard_sets WHERE
    (instance_name, set_key, name) = ('Icecrown Citadel', 'default', 'Normal');

DELETE FROM leaderboard_bosses WHERE
    (instance_name, encounter_name) IN (VALUES
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
        ('Icecrown Citadel', 'The Lich King'));

DELETE FROM leaderboard_instance_variants WHERE
    (instance_name, difficulty_name, max_players) IN (VALUES
        ('Icecrown Citadel', '10 Player', 10),
        ('Icecrown Citadel', '25 Player', 25),
        ('Icecrown Citadel', '10 игроков', 10));

DELETE FROM leaderboard_instances WHERE instance_name = 'Icecrown Citadel';

COMMIT;
