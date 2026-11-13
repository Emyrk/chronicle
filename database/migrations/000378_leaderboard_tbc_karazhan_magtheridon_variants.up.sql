BEGIN;

-- The ratings projector records these TBC raids with their actual player caps.
-- Publish matching variants so the API does not fall back to the implicit
-- zero-player tuple, which has no materialized ratings.
INSERT INTO leaderboard_instance_variants
    (instance_name, difficulty_name, max_players)
VALUES
    ('Karazhan', '', 10),
    ('Magtheridon''s Lair', '', 25);

INSERT INTO leaderboard_variant_overrides
    (layer_key, instance_name, difficulty_name, max_players, enabled)
VALUES
    ('tbc', 'Karazhan', '', 10, true),
    ('tbc', 'Magtheridon''s Lair', '', 25, true);

COMMIT;
