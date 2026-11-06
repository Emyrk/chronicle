BEGIN;

-- Delete only exact values introduced here, in reverse FK order. Existing
-- Naxxramas/Onyxia catalog and vanilla awards are never deleted. Changed or
-- subsequently referenced catalog rows are protected by their foreign keys;
-- no cascades or broad deletes of shared configuration.

DELETE FROM leaderboard_variant_renown WHERE (layer_key, instance_name, encounter_name, difficulty_name, max_players, points) IN (VALUES
    ('wrath', 'Eye of Eternity', 'Malygos', '10 Player', 10, 2),
    ('wrath', 'Eye of Eternity', 'Malygos', '25 Player', 25, 4),
    ('wrath', 'Naxxramas', 'Anub''Rekhan', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Anub''Rekhan', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Four Horsemen', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Four Horsemen', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Gluth', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Gluth', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Gothik the Harvester', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Gothik the Harvester', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Grand Widow Faerlina', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Grand Widow Faerlina', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Grobbulus', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Grobbulus', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Heigan the Unclean', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Heigan the Unclean', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Instructor Razuvious', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Instructor Razuvious', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Kel''Thuzad', '10 Player', 10, 5),
    ('wrath', 'Naxxramas', 'Kel''Thuzad', '25 Player', 25, 7.5),
    ('wrath', 'Naxxramas', 'Loatheb', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Loatheb', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Maexxna', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Maexxna', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Noth the Plaguebringer', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Noth the Plaguebringer', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Patchwerk', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Patchwerk', '25 Player', 25, 1.5),
    ('wrath', 'Naxxramas', 'Sapphiron', '10 Player', 10, 2),
    ('wrath', 'Naxxramas', 'Sapphiron', '25 Player', 25, 3),
    ('wrath', 'Naxxramas', 'Thaddius', '10 Player', 10, 1),
    ('wrath', 'Naxxramas', 'Thaddius', '25 Player', 25, 1.5),
    ('wrath', 'Obsidian Sanctum', 'Sartharion', '10 Player', 10, 1),
    ('wrath', 'Obsidian Sanctum', 'Sartharion', '25 Player', 25, 2),
    ('wrath', 'Obsidian Sanctum', 'Sartharion (1 Drake)', '10 Player', 10, 1),
    ('wrath', 'Obsidian Sanctum', 'Sartharion (1 Drake)', '25 Player', 25, 2),
    ('wrath', 'Obsidian Sanctum', 'Sartharion (2 Drakes)', '10 Player', 10, 2),
    ('wrath', 'Obsidian Sanctum', 'Sartharion (2 Drakes)', '25 Player', 25, 3),
    ('wrath', 'Obsidian Sanctum', 'Sartharion (3 Drakes)', '10 Player', 10, 3),
    ('wrath', 'Obsidian Sanctum', 'Sartharion (3 Drakes)', '25 Player', 25, 4),
    ('wrath', 'Onyxia''s Lair', 'Onyxia', '10 Player', 10, 3),
    ('wrath', 'Onyxia''s Lair', 'Onyxia', '25 Player', 25, 4.5),
    ('wrath', 'Ulduar', 'Algalon the Observer', '10 Player', 10, 8),
    ('wrath', 'Ulduar', 'Algalon the Observer', '25 Player', 25, 12),
    ('wrath', 'Ulduar', 'Assembly of Iron', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Assembly of Iron', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Auriaya', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Auriaya', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Flame Leviathan', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Flame Leviathan', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Freya', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Freya', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'General Vezax', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'General Vezax', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Hodir', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Hodir', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Ignis the Furnace Master', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Ignis the Furnace Master', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Kologarn', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Kologarn', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Mimiron', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Mimiron', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Razorscale', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Razorscale', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Thorim', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'Thorim', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'XT-002 Deconstructor', '10 Player', 10, 2),
    ('wrath', 'Ulduar', 'XT-002 Deconstructor', '25 Player', 25, 3),
    ('wrath', 'Ulduar', 'Yogg-Saron', '10 Player', 10, 6),
    ('wrath', 'Ulduar', 'Yogg-Saron', '25 Player', 25, 9),
    ('wrath', 'Vault of Archavon', 'Archavon the Stone Watcher', '10 Player', 10, 1),
    ('wrath', 'Vault of Archavon', 'Archavon the Stone Watcher', '25 Player', 25, 2),
    ('wrath', 'Vault of Archavon', 'Emalon the Storm Watcher', '10 Player', 10, 1),
    ('wrath', 'Vault of Archavon', 'Emalon the Storm Watcher', '25 Player', 25, 2),
    ('wrath', 'Vault of Archavon', 'Koralon the Flame Watcher', '10 Player', 10, 1),
    ('wrath', 'Vault of Archavon', 'Koralon the Flame Watcher', '25 Player', 25, 2),
    ('wrath', 'Vault of Archavon', 'Toravon the Ice Watcher', '10 Player', 10, 1),
    ('wrath', 'Vault of Archavon', 'Toravon the Ice Watcher', '25 Player', 25, 2));

DELETE FROM leaderboard_member_overrides WHERE (layer_key, instance_name, set_key, encounter_name, enabled, position) IN (VALUES
    ('wrath', 'Eye of Eternity', 'default', 'Malygos', true, 1));

DELETE FROM leaderboard_set_overrides WHERE (layer_key, instance_name, set_key, enabled) IN (VALUES
    ('wrath', 'Eye of Eternity', 'default', true),
    ('wrath', 'Vault of Archavon', 'default', true));

DELETE FROM leaderboard_boss_overrides WHERE (layer_key, instance_name, encounter_name, enabled) IN (VALUES
    ('wrath', 'Eye of Eternity', 'Malygos', true),
    ('wrath', 'Vault of Archavon', 'Archavon the Stone Watcher', true),
    ('wrath', 'Vault of Archavon', 'Emalon the Storm Watcher', true),
    ('wrath', 'Vault of Archavon', 'Koralon the Flame Watcher', true),
    ('wrath', 'Vault of Archavon', 'Toravon the Ice Watcher', true));

DELETE FROM leaderboard_variant_overrides WHERE (layer_key, instance_name, difficulty_name, max_players, enabled) IN (VALUES
    ('wrath', 'Eye of Eternity', '10 Player', 10, true),
    ('wrath', 'Eye of Eternity', '25 Player', 25, true),
    ('wrath', 'Obsidian Sanctum', '10 Player', 10, true),
    ('wrath', 'Obsidian Sanctum', '25 Player', 25, true),
    ('wrath', 'Ulduar', '10 Player', 10, true),
    ('wrath', 'Ulduar', '25 Player', 25, true),
    ('wrath', 'Vault of Archavon', '10 Player', 10, true),
    ('wrath', 'Vault of Archavon', '25 Player', 25, true));

DELETE FROM leaderboard_instance_overrides WHERE (layer_key, instance_name, enabled) IN (VALUES
    ('wrath', 'Eye of Eternity', true),
    ('wrath', 'Vault of Archavon', true));

DELETE FROM leaderboard_set_members WHERE (instance_name, set_key, encounter_name) IN (VALUES
    ('Eye of Eternity', 'default', 'Malygos'));

DELETE FROM leaderboard_sets WHERE (instance_name, set_key, name) IN (VALUES
    ('Eye of Eternity', 'default', 'Normal'),
    ('Vault of Archavon', 'default', 'Normal'));

DELETE FROM leaderboard_bosses WHERE (instance_name, encounter_name) IN (VALUES
    ('Eye of Eternity', 'Malygos'),
    ('Vault of Archavon', 'Archavon the Stone Watcher'),
    ('Vault of Archavon', 'Emalon the Storm Watcher'),
    ('Vault of Archavon', 'Koralon the Flame Watcher'),
    ('Vault of Archavon', 'Toravon the Ice Watcher'));

DELETE FROM leaderboard_instance_variants WHERE (instance_name, difficulty_name, max_players) IN (VALUES
    ('Eye of Eternity', '10 Player', 10),
    ('Eye of Eternity', '25 Player', 25),
    ('Obsidian Sanctum', '10 Player', 10),
    ('Obsidian Sanctum', '25 Player', 25),
    ('Ulduar', '10 Player', 10),
    ('Ulduar', '25 Player', 25),
    ('Vault of Archavon', '10 Player', 10),
    ('Vault of Archavon', '25 Player', 25));

DELETE FROM leaderboard_instances WHERE (instance_name) IN (VALUES
    ('Eye of Eternity'),
    ('Vault of Archavon'));

COMMIT;
