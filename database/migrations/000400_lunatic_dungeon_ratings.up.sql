BEGIN;

-- Small, literal shared configuration only. No historical evidence scans,
-- bulk score rewrites, or startup backfill. Operational rollout: docs/leaderboard-v2/lunatic-dungeons.md.
INSERT INTO leaderboard_layers (key, required_flavors) VALUES
    ('lunatic', ARRAY['lunatic', 'vanilla']::text[]);

INSERT INTO leaderboard_instances (instance_name) VALUES
    ('Deadmines'),
    ('Ragefire Chasm'),
    ('Wailing Caverns'),
    ('Shadowfang Keep');

INSERT INTO leaderboard_bosses (instance_name, encounter_name) VALUES
    ('Deadmines', 'Rhahk''Zor'),
    ('Deadmines', 'Sneed'),
    ('Deadmines', 'Gilnid'),
    ('Deadmines', 'Masterpiece Harvester'),
    ('Deadmines', 'Mr. Smite'),
    ('Deadmines', 'Captain Greenskin'),
    ('Deadmines', 'Edwin VanCleef'),
    ('Deadmines', 'Cookie'),
    ('Deadmines', 'Miner Johnson'),
    ('Deadmines', 'Jared Voss'),
    ('Ragefire Chasm', 'Oggleflint'),
    ('Ragefire Chasm', 'Taragaman the Hungerer'),
    ('Ragefire Chasm', 'Jergosh the Invoker'),
    ('Ragefire Chasm', 'Bazzalan'),
    ('Wailing Caverns', 'Lady Anacondra'),
    ('Wailing Caverns', 'Lord Cobrahn'),
    ('Wailing Caverns', 'Kresh'),
    ('Wailing Caverns', 'Skum'),
    ('Wailing Caverns', 'Zandara Windhoof'),
    ('Wailing Caverns', 'Lord Pythas'),
    ('Wailing Caverns', 'Vangros'),
    ('Wailing Caverns', 'Lord Serpentis'),
    ('Wailing Caverns', 'Verdan the Everliving'),
    ('Wailing Caverns', 'Mutanus the Devourer'),
    ('Wailing Caverns', 'Deviate Faerie Dragon'),
    ('Shadowfang Keep', 'Rethilgore'),
    ('Shadowfang Keep', 'Razorclaw the Butcher'),
    ('Shadowfang Keep', 'Baron Silverlaine'),
    ('Shadowfang Keep', 'Commander Springvale'),
    ('Shadowfang Keep', 'Odo the Blindwatcher'),
    ('Shadowfang Keep', 'Fenrus the Devourer'),
    ('Shadowfang Keep', 'Wolf Master Nandos'),
    ('Shadowfang Keep', 'Archmage Arugal');

INSERT INTO leaderboard_sets (instance_name, set_key, name) VALUES
    ('Deadmines', 'default', 'Normal'),
    ('Ragefire Chasm', 'default', 'Normal'),
    ('Wailing Caverns', 'default', 'Normal'),
    ('Shadowfang Keep', 'default', 'Normal');

INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name) VALUES
    ('Deadmines', 'default', 'Rhahk''Zor'),
    ('Deadmines', 'default', 'Sneed'),
    ('Deadmines', 'default', 'Gilnid'),
    ('Deadmines', 'default', 'Masterpiece Harvester'),
    ('Deadmines', 'default', 'Mr. Smite'),
    ('Deadmines', 'default', 'Captain Greenskin'),
    ('Deadmines', 'default', 'Edwin VanCleef'),
    ('Deadmines', 'default', 'Cookie'),
    ('Ragefire Chasm', 'default', 'Oggleflint'),
    ('Ragefire Chasm', 'default', 'Taragaman the Hungerer'),
    ('Ragefire Chasm', 'default', 'Jergosh the Invoker'),
    ('Ragefire Chasm', 'default', 'Bazzalan'),
    ('Wailing Caverns', 'default', 'Lady Anacondra'),
    ('Wailing Caverns', 'default', 'Lord Cobrahn'),
    ('Wailing Caverns', 'default', 'Kresh'),
    ('Wailing Caverns', 'default', 'Skum'),
    ('Wailing Caverns', 'default', 'Zandara Windhoof'),
    ('Wailing Caverns', 'default', 'Lord Pythas'),
    ('Wailing Caverns', 'default', 'Vangros'),
    ('Wailing Caverns', 'default', 'Lord Serpentis'),
    ('Wailing Caverns', 'default', 'Verdan the Everliving'),
    ('Wailing Caverns', 'default', 'Mutanus the Devourer'),
    ('Shadowfang Keep', 'default', 'Rethilgore'),
    ('Shadowfang Keep', 'default', 'Razorclaw the Butcher'),
    ('Shadowfang Keep', 'default', 'Baron Silverlaine'),
    ('Shadowfang Keep', 'default', 'Commander Springvale'),
    ('Shadowfang Keep', 'default', 'Odo the Blindwatcher'),
    ('Shadowfang Keep', 'default', 'Fenrus the Devourer'),
    ('Shadowfang Keep', 'default', 'Wolf Master Nandos'),
    ('Shadowfang Keep', 'default', 'Archmage Arugal');

INSERT INTO leaderboard_instance_overrides (layer_key, instance_name, enabled) VALUES
    ('lunatic', 'Deadmines', true),
    ('lunatic', 'Ragefire Chasm', true),
    ('lunatic', 'Wailing Caverns', true),
    ('lunatic', 'Shadowfang Keep', true);

INSERT INTO leaderboard_boss_overrides (layer_key, instance_name, encounter_name, enabled) VALUES
    ('lunatic', 'Deadmines', 'Rhahk''Zor', true),
    ('lunatic', 'Deadmines', 'Sneed', true),
    ('lunatic', 'Deadmines', 'Gilnid', true),
    ('lunatic', 'Deadmines', 'Masterpiece Harvester', true),
    ('lunatic', 'Deadmines', 'Mr. Smite', true),
    ('lunatic', 'Deadmines', 'Captain Greenskin', true),
    ('lunatic', 'Deadmines', 'Edwin VanCleef', true),
    ('lunatic', 'Deadmines', 'Cookie', true),
    ('lunatic', 'Deadmines', 'Miner Johnson', true),
    ('lunatic', 'Deadmines', 'Jared Voss', true),
    ('lunatic', 'Ragefire Chasm', 'Oggleflint', true),
    ('lunatic', 'Ragefire Chasm', 'Taragaman the Hungerer', true),
    ('lunatic', 'Ragefire Chasm', 'Jergosh the Invoker', true),
    ('lunatic', 'Ragefire Chasm', 'Bazzalan', true),
    ('lunatic', 'Wailing Caverns', 'Lady Anacondra', true),
    ('lunatic', 'Wailing Caverns', 'Lord Cobrahn', true),
    ('lunatic', 'Wailing Caverns', 'Kresh', true),
    ('lunatic', 'Wailing Caverns', 'Skum', true),
    ('lunatic', 'Wailing Caverns', 'Zandara Windhoof', true),
    ('lunatic', 'Wailing Caverns', 'Lord Pythas', true),
    ('lunatic', 'Wailing Caverns', 'Vangros', true),
    ('lunatic', 'Wailing Caverns', 'Lord Serpentis', true),
    ('lunatic', 'Wailing Caverns', 'Verdan the Everliving', true),
    ('lunatic', 'Wailing Caverns', 'Mutanus the Devourer', true),
    ('lunatic', 'Wailing Caverns', 'Deviate Faerie Dragon', true),
    ('lunatic', 'Shadowfang Keep', 'Rethilgore', true),
    ('lunatic', 'Shadowfang Keep', 'Razorclaw the Butcher', true),
    ('lunatic', 'Shadowfang Keep', 'Baron Silverlaine', true),
    ('lunatic', 'Shadowfang Keep', 'Commander Springvale', true),
    ('lunatic', 'Shadowfang Keep', 'Odo the Blindwatcher', true),
    ('lunatic', 'Shadowfang Keep', 'Fenrus the Devourer', true),
    ('lunatic', 'Shadowfang Keep', 'Wolf Master Nandos', true),
    ('lunatic', 'Shadowfang Keep', 'Archmage Arugal', true);

INSERT INTO leaderboard_set_overrides (layer_key, instance_name, set_key, enabled) VALUES
    ('lunatic', 'Deadmines', 'default', true),
    ('lunatic', 'Ragefire Chasm', 'default', true),
    ('lunatic', 'Wailing Caverns', 'default', true),
    ('lunatic', 'Shadowfang Keep', 'default', true);

INSERT INTO leaderboard_member_overrides (layer_key, instance_name, set_key, encounter_name, enabled, position) VALUES
    ('lunatic', 'Deadmines', 'default', 'Rhahk''Zor', true, 1),
    ('lunatic', 'Deadmines', 'default', 'Sneed', true, 2),
    ('lunatic', 'Deadmines', 'default', 'Gilnid', true, 3),
    ('lunatic', 'Deadmines', 'default', 'Masterpiece Harvester', true, 4),
    ('lunatic', 'Deadmines', 'default', 'Mr. Smite', true, 5),
    ('lunatic', 'Deadmines', 'default', 'Captain Greenskin', true, 6),
    ('lunatic', 'Deadmines', 'default', 'Edwin VanCleef', true, 7),
    ('lunatic', 'Deadmines', 'default', 'Cookie', true, 8),
    ('lunatic', 'Ragefire Chasm', 'default', 'Oggleflint', true, 1),
    ('lunatic', 'Ragefire Chasm', 'default', 'Taragaman the Hungerer', true, 2),
    ('lunatic', 'Ragefire Chasm', 'default', 'Jergosh the Invoker', true, 3),
    ('lunatic', 'Ragefire Chasm', 'default', 'Bazzalan', true, 4),
    ('lunatic', 'Wailing Caverns', 'default', 'Lady Anacondra', true, 1),
    ('lunatic', 'Wailing Caverns', 'default', 'Lord Cobrahn', true, 2),
    ('lunatic', 'Wailing Caverns', 'default', 'Kresh', true, 3),
    ('lunatic', 'Wailing Caverns', 'default', 'Skum', true, 4),
    ('lunatic', 'Wailing Caverns', 'default', 'Zandara Windhoof', true, 5),
    ('lunatic', 'Wailing Caverns', 'default', 'Lord Pythas', true, 6),
    ('lunatic', 'Wailing Caverns', 'default', 'Vangros', true, 7),
    ('lunatic', 'Wailing Caverns', 'default', 'Lord Serpentis', true, 8),
    ('lunatic', 'Wailing Caverns', 'default', 'Verdan the Everliving', true, 9),
    ('lunatic', 'Wailing Caverns', 'default', 'Mutanus the Devourer', true, 10),
    ('lunatic', 'Shadowfang Keep', 'default', 'Rethilgore', true, 1),
    ('lunatic', 'Shadowfang Keep', 'default', 'Razorclaw the Butcher', true, 2),
    ('lunatic', 'Shadowfang Keep', 'default', 'Baron Silverlaine', true, 3),
    ('lunatic', 'Shadowfang Keep', 'default', 'Commander Springvale', true, 4),
    ('lunatic', 'Shadowfang Keep', 'default', 'Odo the Blindwatcher', true, 5),
    ('lunatic', 'Shadowfang Keep', 'default', 'Fenrus the Devourer', true, 6),
    ('lunatic', 'Shadowfang Keep', 'default', 'Wolf Master Nandos', true, 7),
    ('lunatic', 'Shadowfang Keep', 'default', 'Archmage Arugal', true, 8);

-- Optional bosses award Renown without blocking default-set averages.
INSERT INTO leaderboard_boss_renown (layer_key, instance_name, encounter_name, points) VALUES
    ('lunatic', 'Deadmines', 'Rhahk''Zor', 1),
    ('lunatic', 'Deadmines', 'Sneed', 1),
    ('lunatic', 'Deadmines', 'Gilnid', 1),
    ('lunatic', 'Deadmines', 'Masterpiece Harvester', 1),
    ('lunatic', 'Deadmines', 'Mr. Smite', 1),
    ('lunatic', 'Deadmines', 'Captain Greenskin', 1),
    ('lunatic', 'Deadmines', 'Edwin VanCleef', 2),
    ('lunatic', 'Deadmines', 'Cookie', 1),
    ('lunatic', 'Deadmines', 'Miner Johnson', 1),
    ('lunatic', 'Deadmines', 'Jared Voss', 1),
    ('lunatic', 'Ragefire Chasm', 'Oggleflint', 1),
    ('lunatic', 'Ragefire Chasm', 'Taragaman the Hungerer', 1),
    ('lunatic', 'Ragefire Chasm', 'Jergosh the Invoker', 1),
    ('lunatic', 'Ragefire Chasm', 'Bazzalan', 2),
    ('lunatic', 'Wailing Caverns', 'Lady Anacondra', 1),
    ('lunatic', 'Wailing Caverns', 'Lord Cobrahn', 1),
    ('lunatic', 'Wailing Caverns', 'Kresh', 1),
    ('lunatic', 'Wailing Caverns', 'Skum', 1),
    ('lunatic', 'Wailing Caverns', 'Zandara Windhoof', 1),
    ('lunatic', 'Wailing Caverns', 'Lord Pythas', 1),
    ('lunatic', 'Wailing Caverns', 'Vangros', 1),
    ('lunatic', 'Wailing Caverns', 'Lord Serpentis', 1),
    ('lunatic', 'Wailing Caverns', 'Verdan the Everliving', 1),
    ('lunatic', 'Wailing Caverns', 'Mutanus the Devourer', 2),
    ('lunatic', 'Wailing Caverns', 'Deviate Faerie Dragon', 1),
    ('lunatic', 'Shadowfang Keep', 'Rethilgore', 1),
    ('lunatic', 'Shadowfang Keep', 'Razorclaw the Butcher', 1),
    ('lunatic', 'Shadowfang Keep', 'Baron Silverlaine', 1),
    ('lunatic', 'Shadowfang Keep', 'Commander Springvale', 1),
    ('lunatic', 'Shadowfang Keep', 'Odo the Blindwatcher', 1),
    ('lunatic', 'Shadowfang Keep', 'Fenrus the Devourer', 1),
    ('lunatic', 'Shadowfang Keep', 'Wolf Master Nandos', 1),
    ('lunatic', 'Shadowfang Keep', 'Archmage Arugal', 2);

-- Existing Vanilla-style logs use the exact implicit empty difficulty / zero-size
-- cohort. No invented Normal/5 variant. Weights are independently approved,
-- not derived from Renown. Level-one Unknown specs retain Renown but do not yet
-- produce spec-mode Mastery/Peak observations.
INSERT INTO leaderboard_career_variants
    (instance_name, difficulty_name, max_players, required_flavors, include_average, include_renown, weight) VALUES
    ('Deadmines', '', 0, ARRAY['lunatic', 'vanilla']::text[], true, true, 3),
    ('Ragefire Chasm', '', 0, ARRAY['lunatic', 'vanilla']::text[], true, true, 1),
    ('Wailing Caverns', '', 0, ARRAY['lunatic', 'vanilla']::text[], true, true, 3),
    ('Shadowfang Keep', '', 0, ARRAY['lunatic', 'vanilla']::text[], true, true, 3);

COMMIT;
