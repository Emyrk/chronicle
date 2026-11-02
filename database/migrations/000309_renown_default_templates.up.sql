BEGIN;

-- Templates are immutable snapshots: a later calibration gets a new version, not an UPDATE.
CREATE TABLE rating_renown_templates (
    flavor TEXT NOT NULL,
    version INT NOT NULL CHECK (version > 0),
    PRIMARY KEY (flavor, version)
);
CREATE TABLE rating_renown_template_bosses (
    flavor TEXT NOT NULL,
    version INT NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    renown_points DOUBLE PRECISION NOT NULL CHECK (renown_points >= 0),
    PRIMARY KEY (flavor, version, instance_name, encounter_name),
    FOREIGN KEY (flavor, version) REFERENCES rating_renown_templates(flavor, version)
);

INSERT INTO rating_renown_templates (flavor, version) VALUES ('turtle', 1), ('vanilla', 1);

-- Per-kill points from docs/renown-turtle-worksheet.md. Four Edge of Madness
-- variants are individually canonical; only one is available in each reset.
INSERT INTO rating_renown_template_bosses (flavor, version, instance_name, encounter_name, renown_points) VALUES
    ('turtle', 1, 'Zul''Gurub', 'High Priestess Jeklik', 0),
    ('turtle', 1, 'Zul''Gurub', 'High Priest Venoxis', 0),
    ('turtle', 1, 'Zul''Gurub', 'High Priestess Mar''li', 0),
    ('turtle', 1, 'Zul''Gurub', 'Bloodlord Mandokir', 1),
    ('turtle', 1, 'Zul''Gurub', 'High Priest Thekal', 0),
    ('turtle', 1, 'Zul''Gurub', 'High Priestess Arlokk', 0),
    ('turtle', 1, 'Zul''Gurub', 'Jin''do the Hexxer', 1),
    ('turtle', 1, 'Zul''Gurub', 'Hakkar', 3),
    ('turtle', 1, 'Zul''Gurub', 'Gahz''ranka', 1),
    ('turtle', 1, 'Zul''Gurub', 'Gri''lek', 1),
    ('turtle', 1, 'Zul''Gurub', 'Hazza''rah', 1),
    ('turtle', 1, 'Zul''Gurub', 'Renataki', 1),
    ('turtle', 1, 'Zul''Gurub', 'Wushoolay', 1),
    ('turtle', 1, 'Ruins of Ahn''Qiraj', 'Kurinnaxx', 1),
    ('turtle', 1, 'Ruins of Ahn''Qiraj', 'General Rajaxx', 1),
    ('turtle', 1, 'Ruins of Ahn''Qiraj', 'Moam', 1),
    ('turtle', 1, 'Ruins of Ahn''Qiraj', 'Buru the Gorger', 1),
    ('turtle', 1, 'Ruins of Ahn''Qiraj', 'Ayamiss the Hunter', 1),
    ('turtle', 1, 'Ruins of Ahn''Qiraj', 'Ossirian the Unscarred', 3),
    ('turtle', 1, 'Onyxia''s Lair', 'Onyxia', 2),
    ('turtle', 1, 'Onyxia''s Lair', 'Broodcommander Axelus', 1),
    ('turtle', 1, 'Lower Tower of Karazhan', 'Lord Blackwald II', 1),
    ('turtle', 1, 'Lower Tower of Karazhan', 'Brood Queen Araxxna', 1),
    ('turtle', 1, 'Lower Tower of Karazhan', 'Grizikil', 1),
    ('turtle', 1, 'Lower Tower of Karazhan', 'Clawlord Howlfang', 1),
    ('turtle', 1, 'Lower Tower of Karazhan', 'Moroes', 2),
    ('turtle', 1, 'Emerald Sanctum', 'Erennius', 2),
    ('turtle', 1, 'Emerald Sanctum', 'Solnius', 3),
    ('turtle', 1, 'Emerald Sanctum', 'Solnius (Hard Mode)', 5),
    ('turtle', 1, 'Molten Core', 'Lucifron', 1),
    ('turtle', 1, 'Molten Core', 'Magmadar', 1),
    ('turtle', 1, 'Molten Core', 'Garr', 1),
    ('turtle', 1, 'Molten Core', 'Shazzrah', 1),
    ('turtle', 1, 'Molten Core', 'Baron Geddon', 1),
    ('turtle', 1, 'Molten Core', 'Sulfuron Harbinger', 1),
    ('turtle', 1, 'Molten Core', 'Golemagg the Incinerator', 1),
    ('turtle', 1, 'Molten Core', 'Incindis', 1),
    ('turtle', 1, 'Molten Core', 'Basalthar & Smoldaris', 1),
    ('turtle', 1, 'Molten Core', 'Sorcerer-Thane Thaurissan', 1),
    ('turtle', 1, 'Molten Core', 'Majordomo Executus', 2),
    ('turtle', 1, 'Molten Core', 'Ragnaros', 5),
    ('turtle', 1, 'Blackwing Lair', 'Razorgore the Untamed', 2),
    ('turtle', 1, 'Blackwing Lair', 'Vaelastrasz the Corrupt', 2),
    ('turtle', 1, 'Blackwing Lair', 'Broodlord Lashlayer', 2),
    ('turtle', 1, 'Blackwing Lair', 'Firemaw', 2),
    ('turtle', 1, 'Blackwing Lair', 'Ebonroc', 2),
    ('turtle', 1, 'Blackwing Lair', 'Flamegor', 2),
    ('turtle', 1, 'Blackwing Lair', 'Chromaggus', 2),
    ('turtle', 1, 'Blackwing Lair', 'Ezzel Darkbrewer', 2),
    ('turtle', 1, 'Blackwing Lair', 'Nefarian', 9),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'The Prophet Skeram', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'Bug Family', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'Battleguard Sartura', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'Fankriss the Unyielding', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'Viscidus', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'Princess Huhuran', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'Twin Emperors', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'Ouro', 3),
    ('turtle', 1, 'Temple of Ahn''Qiraj', 'C''Thun', 11),
    ('turtle', 1, 'Timbermaw Hold', 'Kodiak & Rotgrowl', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Trioch the Devourer', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Karrsh the Sentinel', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Chieftain Partath', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Archdruid Kronn', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Selenaxx Foulheart', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Loktanag the Vile', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Ormanos the Cracked', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Ursol', 3),
    ('turtle', 1, 'Timbermaw Hold', 'Peroth''arn', 8),
    ('turtle', 1, 'Naxxramas', 'Anub''Rekhan', 3),
    ('turtle', 1, 'Naxxramas', 'Grand Widow Faerlina', 3),
    ('turtle', 1, 'Naxxramas', 'Maexxna', 3),
    ('turtle', 1, 'Naxxramas', 'Noth the Plaguebringer', 3),
    ('turtle', 1, 'Naxxramas', 'Heigan the Unclean', 3),
    ('turtle', 1, 'Naxxramas', 'Loatheb', 3),
    ('turtle', 1, 'Naxxramas', 'Instructor Razuvious', 3),
    ('turtle', 1, 'Naxxramas', 'Gothik the Harvester', 3),
    ('turtle', 1, 'Naxxramas', 'Four Horsemen', 3),
    ('turtle', 1, 'Naxxramas', 'Patchwerk', 3),
    ('turtle', 1, 'Naxxramas', 'Grobbulus', 3),
    ('turtle', 1, 'Naxxramas', 'Gluth', 3),
    ('turtle', 1, 'Naxxramas', 'Thaddius', 3),
    ('turtle', 1, 'Naxxramas', 'Sapphiron', 3),
    ('turtle', 1, 'Naxxramas', 'Kel''Thuzad', 8),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Keeper Gnarlmoon', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Anomalus', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Rupturan the Broken', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Mephistroth', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Ley-Watcher Incantagos', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Echo of Medivh', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'King', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Sanv Tas''dal', 6),
    ('turtle', 1, 'Upper Tower of Karazhan', 'Kruul', 7),
    ('vanilla', 1, 'Molten Core', 'Lucifron', 1),
    ('vanilla', 1, 'Molten Core', 'Magmadar', 1),
    ('vanilla', 1, 'Molten Core', 'Garr', 1),
    ('vanilla', 1, 'Molten Core', 'Shazzrah', 1),
    ('vanilla', 1, 'Molten Core', 'Baron Geddon', 1),
    ('vanilla', 1, 'Molten Core', 'Sulfuron Harbinger', 1),
    ('vanilla', 1, 'Molten Core', 'Golemagg the Incinerator', 1),
    ('vanilla', 1, 'Molten Core', 'Majordomo Executus', 2),
    ('vanilla', 1, 'Molten Core', 'Ragnaros', 5),
    ('vanilla', 1, 'Molten Core', 'Gehennas', 1);

-- Only a newly created explicit group policy receives defaults. Existing policy rows
-- and their admin overrides are never updated by this trigger.
CREATE FUNCTION apply_rating_renown_template() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    selected_flavor TEXT;
    template_version INT;
BEGIN
    SELECT CASE
        WHEN server.id = '10ac9e23-ff74-43ed-83ad-96c123017097'::uuid THEN 'turtle'
        WHEN 'vanilla' = ANY(dataset.default_flavor) THEN 'vanilla'
        ELSE NULL END INTO selected_flavor
    FROM rating_realm_groups grp
    JOIN wow_servers server ON server.id = grp.server_id
    LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
    LEFT JOIN datasets dataset ON dataset.id = COALESCE(server.default_dataset_id, tenant.default_dataset_id)
    WHERE grp.id = NEW.group_id;

    IF selected_flavor IS NOT NULL THEN
        SELECT max(version) INTO template_version FROM rating_renown_templates
        WHERE flavor = selected_flavor;
        INSERT INTO rating_group_raid_policies (group_id, instance_name, peak_weight, mastery_weight)
        SELECT NEW.group_id, instance_name, 1, 1
        FROM rating_renown_template_bosses
        WHERE flavor = selected_flavor AND version = template_version
        GROUP BY instance_name
        ON CONFLICT (group_id, instance_name) DO NOTHING;

        INSERT INTO rating_group_boss_policies
            (group_id, instance_name, encounter_name, peak_weight, mastery_weight, renown_points)
        SELECT NEW.group_id, instance_name, encounter_name, 1, 1, renown_points
        FROM rating_renown_template_bosses
        WHERE flavor = selected_flavor AND version = template_version
        ON CONFLICT (group_id, instance_name, encounter_name) DO NOTHING;
        -- Child-row version triggers record edits. Initial defaults are part of
        -- this initial policy, not subsequent administrative revisions.
        UPDATE rating_group_policies SET version = NEW.version WHERE group_id = NEW.group_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER rating_policy_seed_renown AFTER INSERT ON rating_group_policies
    FOR EACH ROW EXECUTE FUNCTION apply_rating_renown_template();

-- Only the small, explicitly configured policy table is touched. Preserve
-- existing effective awards before removing the separate final-boss field.
UPDATE rating_group_boss_policies
SET renown_points = renown_points + final_boss_bonus
WHERE final_boss_bonus > 0;
DROP INDEX rating_group_final_boss_idx;
ALTER TABLE rating_group_boss_policies DROP COLUMN final_boss_bonus;

COMMIT;
