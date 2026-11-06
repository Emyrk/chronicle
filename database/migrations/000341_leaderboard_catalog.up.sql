BEGIN;

-- Natural parser identities are shared across layers, not copied into per-server catalogs.
-- Catalog existence is inert. An applicable explicit enabled=true is required.
CREATE FUNCTION leaderboard_sorted_flavors(tags text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT COALESCE(array_agg(DISTINCT tag ORDER BY tag), '{}'::text[])
    FROM unnest(tags) tag WHERE tag IS NOT NULL AND btrim(tag) <> ''
$$;

CREATE TABLE leaderboard_layers (
    key text PRIMARY KEY CHECK (btrim(key) <> ''),
    required_flavors text[] NOT NULL UNIQUE,
    CHECK (required_flavors = leaderboard_sorted_flavors(required_flavors))
);
CREATE TABLE leaderboard_instances (
    instance_name text PRIMARY KEY CHECK (btrim(instance_name) <> '')
);
CREATE TABLE leaderboard_instance_variants (
    instance_name text NOT NULL REFERENCES leaderboard_instances,
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL CHECK (max_players > 0),
    PRIMARY KEY (instance_name, difficulty_name, max_players)
);
CREATE TABLE leaderboard_bosses (
    instance_name text NOT NULL REFERENCES leaderboard_instances,
    encounter_name text NOT NULL CHECK (btrim(encounter_name) <> ''),
    PRIMARY KEY (instance_name, encounter_name)
);
CREATE TABLE leaderboard_sets (
    instance_name text NOT NULL REFERENCES leaderboard_instances,
    set_key text NOT NULL CHECK (btrim(set_key) <> ''),
    name text NOT NULL CHECK (btrim(name) <> ''),
    PRIMARY KEY (instance_name, set_key)
);
CREATE TABLE leaderboard_set_members (
    instance_name text NOT NULL,
    set_key text NOT NULL,
    encounter_name text NOT NULL,
    PRIMARY KEY (instance_name, set_key, encounter_name),
    FOREIGN KEY (instance_name, set_key) REFERENCES leaderboard_sets,
    FOREIGN KEY (instance_name, encounter_name) REFERENCES leaderboard_bosses
);

CREATE TABLE leaderboard_instance_overrides (
    layer_key text NOT NULL REFERENCES leaderboard_layers,
    instance_name text NOT NULL,
    enabled boolean NOT NULL,
    PRIMARY KEY (layer_key, instance_name),
    FOREIGN KEY (instance_name) REFERENCES leaderboard_instances
);

CREATE TABLE leaderboard_variant_overrides (
    layer_key text NOT NULL REFERENCES leaderboard_layers,
    instance_name text NOT NULL,
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL,
    enabled boolean NOT NULL,
    PRIMARY KEY (layer_key, instance_name, difficulty_name, max_players),
    FOREIGN KEY (instance_name, difficulty_name, max_players) REFERENCES leaderboard_instance_variants
);

CREATE TABLE leaderboard_boss_overrides (
    layer_key text NOT NULL REFERENCES leaderboard_layers,
    instance_name text NOT NULL,
    encounter_name text NOT NULL,
    enabled boolean NOT NULL,
    PRIMARY KEY (layer_key, instance_name, encounter_name),
    FOREIGN KEY (instance_name, encounter_name) REFERENCES leaderboard_bosses
);

CREATE TABLE leaderboard_set_overrides (
    layer_key text NOT NULL REFERENCES leaderboard_layers,
    instance_name text NOT NULL,
    set_key text NOT NULL,
    enabled boolean NOT NULL,
    PRIMARY KEY (layer_key, instance_name, set_key),
    FOREIGN KEY (instance_name, set_key) REFERENCES leaderboard_sets
);

CREATE TABLE leaderboard_member_overrides (
    layer_key text NOT NULL REFERENCES leaderboard_layers,
    instance_name text NOT NULL,
    set_key text NOT NULL,
    encounter_name text NOT NULL,
    enabled boolean,
    position integer CHECK (position > 0),
    CHECK (enabled IS NOT NULL OR position IS NOT NULL),
    PRIMARY KEY (layer_key, instance_name, set_key, encounter_name),
    FOREIGN KEY (instance_name, set_key, encounter_name) REFERENCES leaderboard_set_members
);

-- Missing award rows inherit; zero is a real award. Neither table references sets.
CREATE TABLE leaderboard_boss_renown (
    layer_key text NOT NULL REFERENCES leaderboard_layers,
    instance_name text NOT NULL,
    encounter_name text NOT NULL,
    points double precision NOT NULL CHECK (points >= 0 AND points < 'Infinity'::double precision),
    PRIMARY KEY (layer_key, instance_name, encounter_name),
    FOREIGN KEY (instance_name, encounter_name) REFERENCES leaderboard_bosses
);
CREATE TABLE leaderboard_variant_renown (
    layer_key text NOT NULL REFERENCES leaderboard_layers,
    instance_name text NOT NULL,
    encounter_name text NOT NULL,
    difficulty_name text NOT NULL,
    max_players smallint NOT NULL,
    points double precision NOT NULL CHECK (points >= 0 AND points < 'Infinity'::double precision),
    PRIMARY KEY (layer_key, instance_name, encounter_name, difficulty_name, max_players),
    FOREIGN KEY (instance_name, encounter_name) REFERENCES leaderboard_bosses,
    FOREIGN KEY (instance_name, difficulty_name, max_players) REFERENCES leaderboard_instance_variants
);

COMMIT;
