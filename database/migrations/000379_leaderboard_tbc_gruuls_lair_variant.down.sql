BEGIN;

DELETE FROM leaderboard_variant_overrides WHERE
    (layer_key, instance_name, difficulty_name, max_players, enabled) IN (VALUES
        ('tbc', 'Gruul''s Lair', '', 25, true));

DELETE FROM leaderboard_instance_variants WHERE
    (instance_name, difficulty_name, max_players) IN (VALUES
        ('Gruul''s Lair', '', 25));

COMMIT;
