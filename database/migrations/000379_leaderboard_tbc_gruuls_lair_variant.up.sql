BEGIN;

-- The ratings projector records Gruul's Lair with its actual 25-player cap.
-- Publish the matching variant so the API does not fall back to the implicit
-- zero-player tuple, which has no materialized ratings.
INSERT INTO leaderboard_instance_variants
    (instance_name, difficulty_name, max_players)
VALUES
    ('Gruul''s Lair', '', 25);

INSERT INTO leaderboard_variant_overrides
    (layer_key, instance_name, difficulty_name, max_players, enabled)
VALUES
    ('tbc', 'Gruul''s Lair', '', 25, true);

COMMIT;
