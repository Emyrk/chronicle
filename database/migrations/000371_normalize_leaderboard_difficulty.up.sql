BEGIN;

-- Only the small shared configuration tables are rewritten. No evidence, score,
-- membership, or historical tables are read or changed. Serialize admin edits
-- with the conflict check so no configuration can be lost during normalization.
LOCK TABLE leaderboard_instance_variants, leaderboard_variant_overrides,
    leaderboard_variant_renown, leaderboard_career_variants IN EXCLUSIVE MODE;

-- Exact legacy aliases only: preserve arbitrary future encounter variant keys.
-- Size remains an independent key, including the vanilla implicit size of zero.
CREATE FUNCTION pg_temp.leaderboard_canonical_difficulty(name text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT CASE
        WHEN name IN ('10 Player', '25 Player', '10 игроков', '25 игроков', 'Normal') THEN ''
        WHEN name IN ('10 Player (Heroic)', '25 Player (Heroic)', 'Heroic') THEN 'heroic'
        ELSE name
    END
$$;

CREATE TEMP TABLE normalized_instance_variants ON COMMIT DROP AS
SELECT DISTINCT instance_name, pg_temp.leaderboard_canonical_difficulty(difficulty_name) AS difficulty_name, max_players
FROM leaderboard_instance_variants;

CREATE TEMP TABLE normalized_variant_overrides ON COMMIT DROP AS
SELECT DISTINCT layer_key, instance_name, pg_temp.leaderboard_canonical_difficulty(difficulty_name) AS difficulty_name, max_players, enabled
FROM leaderboard_variant_overrides;

CREATE TEMP TABLE normalized_variant_renown ON COMMIT DROP AS
SELECT DISTINCT layer_key, instance_name, encounter_name, pg_temp.leaderboard_canonical_difficulty(difficulty_name) AS difficulty_name, max_players, points
FROM leaderboard_variant_renown;

CREATE TEMP TABLE normalized_career_variants ON COMMIT DROP AS
SELECT DISTINCT instance_name, pg_temp.leaderboard_canonical_difficulty(difficulty_name) AS difficulty_name, max_players, required_flavors, include_average, include_renown, weight
FROM leaderboard_career_variants;

-- Identical aliases may collapse, but differing policy must be resolved by an
-- administrator. In particular, NULL weights and explicit weights differ.
DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1 FROM normalized_variant_overrides
        GROUP BY layer_key, instance_name, difficulty_name, max_players HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'migration 371: conflicting legacy difficulty aliases in leaderboard_variant_overrides; resolve configuration before retrying';
    END IF;
    IF EXISTS (
        SELECT 1 FROM normalized_variant_renown
        GROUP BY layer_key, instance_name, encounter_name, difficulty_name, max_players HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'migration 371: conflicting legacy difficulty aliases in leaderboard_variant_renown; resolve configuration before retrying';
    END IF;
    IF EXISTS (
        SELECT 1 FROM normalized_career_variants
        GROUP BY instance_name, difficulty_name, max_players HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'migration 371: conflicting legacy difficulty aliases in leaderboard_career_variants; resolve configuration before retrying';
    END IF;
END
$migration$;

DELETE FROM leaderboard_variant_overrides;
DELETE FROM leaderboard_variant_renown;
DELETE FROM leaderboard_career_variants;
DELETE FROM leaderboard_instance_variants;

INSERT INTO leaderboard_instance_variants (instance_name, difficulty_name, max_players)
SELECT instance_name, difficulty_name, max_players FROM normalized_instance_variants;

INSERT INTO leaderboard_variant_overrides (layer_key, instance_name, difficulty_name, max_players, enabled)
SELECT layer_key, instance_name, difficulty_name, max_players, enabled FROM normalized_variant_overrides;

INSERT INTO leaderboard_variant_renown (layer_key, instance_name, encounter_name, difficulty_name, max_players, points)
SELECT layer_key, instance_name, encounter_name, difficulty_name, max_players, points FROM normalized_variant_renown;

INSERT INTO leaderboard_career_variants (instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown, weight)
SELECT instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown, weight FROM normalized_career_variants;

DROP FUNCTION pg_temp.leaderboard_canonical_difficulty(text);

COMMIT;
