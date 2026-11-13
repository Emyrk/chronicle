BEGIN;

DELETE FROM leaderboard_variant_overrides WHERE
    (layer_key, instance_name, difficulty_name, max_players, enabled) IN (VALUES
        ('tbc', 'Karazhan', '', 10, true),
        ('tbc', 'Magtheridon''s Lair', '', 25, true));

DELETE FROM leaderboard_instance_variants WHERE
    (instance_name, difficulty_name, max_players) IN (VALUES
        ('Karazhan', '', 10),
        ('Magtheridon''s Lair', '', 25));

COMMIT;
