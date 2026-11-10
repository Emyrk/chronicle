BEGIN;

-- Shared configuration only. No tenant evidence scans or historical backfill.
CREATE TABLE leaderboard_career_variants (
    instance_name text NOT NULL REFERENCES leaderboard_instances,
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players >= 0),
    required_flavors text[] NOT NULL CHECK (cardinality(required_flavors) > 0 AND required_flavors = leaderboard_sorted_flavors(required_flavors)),
    include_average boolean NOT NULL,
    include_renown boolean NOT NULL,
    weight double precision CHECK (weight > 0 AND weight < 'Infinity'::double precision),
    PRIMARY KEY (instance_name, difficulty_name, max_players)
);
COMMENT ON COLUMN leaderboard_career_variants.weight IS 'Explicit career average weight. NULL is unconfigured and blocks active eligible averages. Never derived from Renown.';

-- Only reviewed exact Wrath tuples exist in the initial variant catalog.
-- Numeric weights await product approval and deliberately remain NULL.
INSERT INTO leaderboard_career_variants
    (instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown)
VALUES
    ('Naxxramas', '10 Player', 10, ARRAY['wrath'], true, true),
    ('Naxxramas', '25 Player', 25, ARRAY['wrath'], true, true),
    ('Onyxia''s Lair', '10 Player', 10, ARRAY['wrath'], true, true),
    ('Onyxia''s Lair', '25 Player', 25, ARRAY['wrath'], true, true),
    ('Eye of Eternity', '10 Player', 10, ARRAY['wrath'], true, true),
    ('Eye of Eternity', '25 Player', 25, ARRAY['wrath'], true, true),
    ('Obsidian Sanctum', '10 Player', 10, ARRAY['wrath'], false, true),
    ('Obsidian Sanctum', '25 Player', 25, ARRAY['wrath'], false, true),
    ('Ulduar', '10 Player', 10, ARRAY['wrath'], true, true),
    ('Ulduar', '25 Player', 25, ARRAY['wrath'], true, true),
    ('Vault of Archavon', '10 Player', 10, ARRAY['wrath'], true, true),
    ('Vault of Archavon', '25 Player', 25, ARRAY['wrath'], true, true);

-- Existing non-Wrath reads use the exact implicit variant empty difficulty/0.
INSERT INTO leaderboard_career_variants
    (instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown)
VALUES
    ('Emerald Sanctum', '', 0, ARRAY['nightmare-of-ursol', 'vanilla'], true, true),
    ('Lower Tower of Karazhan', '', 0, ARRAY['nightmare-of-ursol', 'vanilla'], true, true),
    ('Timbermaw Hold', '', 0, ARRAY['nightmare-of-ursol', 'vanilla'], true, true),
    ('Upper Tower of Karazhan', '', 0, ARRAY['nightmare-of-ursol', 'vanilla'], true, true),
    ('Gruul''s Lair', '', 0, ARRAY['tbc'], true, true),
    ('Serpentshrine Cavern', '', 0, ARRAY['tbc'], true, true),
    ('Tempest Keep', '', 0, ARRAY['tbc'], true, true),
    ('Blackwing Lair', '', 0, ARRAY['vanilla'], true, true),
    ('Molten Core', '', 0, ARRAY['vanilla'], true, true),
    ('Naxxramas', '', 0, ARRAY['vanilla'], true, true),
    ('Onyxia''s Lair', '', 0, ARRAY['vanilla'], true, true),
    ('Ruins of Ahn''Qiraj', '', 0, ARRAY['vanilla'], true, true),
    ('Temple of Ahn''Qiraj', '', 0, ARRAY['vanilla'], true, true),
    ('Zul''Gurub', '', 0, ARRAY['vanilla'], true, true),
    ('Scarlet Monastery', '', 0, ARRAY['vanilla', 'vanillaplus'], true, true);

COMMIT;
