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

INSERT INTO rating_renown_templates (flavor, version) VALUES ('vanilla', 1), ('nightmare-of-ursol', 1);

-- Shared vanilla bosses use the vanilla flavor; only Turtle-specific bosses use
-- nightmare-of-ursol. Four Edge of Madness variants are individually canonical;
-- only one is available in each reset. Points are from docs/renown-turtle-worksheet.md.
INSERT INTO rating_renown_template_bosses (flavor, version, instance_name, encounter_name, renown_points) VALUES
    ('vanilla', 1, 'Zul''Gurub', 'High Priestess Jeklik', 0),
    ('vanilla', 1, 'Zul''Gurub', 'High Priest Venoxis', 0),
    ('vanilla', 1, 'Zul''Gurub', 'High Priestess Mar''li', 0),
    ('vanilla', 1, 'Zul''Gurub', 'Bloodlord Mandokir', 1),
    ('vanilla', 1, 'Zul''Gurub', 'High Priest Thekal', 0),
    ('vanilla', 1, 'Zul''Gurub', 'High Priestess Arlokk', 0),
    ('vanilla', 1, 'Zul''Gurub', 'Jin''do the Hexxer', 1),
    ('vanilla', 1, 'Zul''Gurub', 'Hakkar', 3),
    ('vanilla', 1, 'Zul''Gurub', 'Gahz''ranka', 1),
    ('vanilla', 1, 'Zul''Gurub', 'Gri''lek', 1),
    ('vanilla', 1, 'Zul''Gurub', 'Hazza''rah', 1),
    ('vanilla', 1, 'Zul''Gurub', 'Renataki', 1),
    ('vanilla', 1, 'Zul''Gurub', 'Wushoolay', 1),
    ('vanilla', 1, 'Ruins of Ahn''Qiraj', 'Kurinnaxx', 1),
    ('vanilla', 1, 'Ruins of Ahn''Qiraj', 'General Rajaxx', 1),
    ('vanilla', 1, 'Ruins of Ahn''Qiraj', 'Moam', 1),
    ('vanilla', 1, 'Ruins of Ahn''Qiraj', 'Buru the Gorger', 1),
    ('vanilla', 1, 'Ruins of Ahn''Qiraj', 'Ayamiss the Hunter', 1),
    ('vanilla', 1, 'Ruins of Ahn''Qiraj', 'Ossirian the Unscarred', 3),
    ('vanilla', 1, 'Onyxia''s Lair', 'Onyxia', 2),
    ('nightmare-of-ursol', 1, 'Onyxia''s Lair', 'Broodcommander Axelus', 1),
    ('nightmare-of-ursol', 1, 'Lower Tower of Karazhan', 'Lord Blackwald II', 1),
    ('nightmare-of-ursol', 1, 'Lower Tower of Karazhan', 'Brood Queen Araxxna', 1),
    ('nightmare-of-ursol', 1, 'Lower Tower of Karazhan', 'Grizikil', 1),
    ('nightmare-of-ursol', 1, 'Lower Tower of Karazhan', 'Clawlord Howlfang', 1),
    ('nightmare-of-ursol', 1, 'Lower Tower of Karazhan', 'Moroes', 2),
    ('nightmare-of-ursol', 1, 'Emerald Sanctum', 'Erennius', 2),
    ('nightmare-of-ursol', 1, 'Emerald Sanctum', 'Solnius', 3),
    ('nightmare-of-ursol', 1, 'Emerald Sanctum', 'Solnius (Hard Mode)', 5),
    ('vanilla', 1, 'Molten Core', 'Lucifron', 1),
    ('vanilla', 1, 'Molten Core', 'Magmadar', 1),
    ('vanilla', 1, 'Molten Core', 'Garr', 1),
    ('vanilla', 1, 'Molten Core', 'Shazzrah', 1),
    ('vanilla', 1, 'Molten Core', 'Baron Geddon', 1),
    ('vanilla', 1, 'Molten Core', 'Sulfuron Harbinger', 1),
    ('vanilla', 1, 'Molten Core', 'Golemagg the Incinerator', 1),
    ('nightmare-of-ursol', 1, 'Molten Core', 'Incindis', 1),
    ('nightmare-of-ursol', 1, 'Molten Core', 'Basalthar & Smoldaris', 1),
    ('nightmare-of-ursol', 1, 'Molten Core', 'Sorcerer-Thane Thaurissan', 1),
    ('vanilla', 1, 'Molten Core', 'Majordomo Executus', 2),
    ('vanilla', 1, 'Molten Core', 'Ragnaros', 5),
    ('vanilla', 1, 'Blackwing Lair', 'Razorgore the Untamed', 2),
    ('vanilla', 1, 'Blackwing Lair', 'Vaelastrasz the Corrupt', 2),
    ('vanilla', 1, 'Blackwing Lair', 'Broodlord Lashlayer', 2),
    ('vanilla', 1, 'Blackwing Lair', 'Firemaw', 2),
    ('vanilla', 1, 'Blackwing Lair', 'Ebonroc', 2),
    ('vanilla', 1, 'Blackwing Lair', 'Flamegor', 2),
    ('vanilla', 1, 'Blackwing Lair', 'Chromaggus', 2),
    ('nightmare-of-ursol', 1, 'Blackwing Lair', 'Ezzel Darkbrewer', 2),
    ('vanilla', 1, 'Blackwing Lair', 'Nefarian', 9),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'The Prophet Skeram', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'Bug Family', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'Battleguard Sartura', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'Fankriss the Unyielding', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'Viscidus', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'Princess Huhuran', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'Twin Emperors', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'Ouro', 3),
    ('vanilla', 1, 'Temple of Ahn''Qiraj', 'C''Thun', 11),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Kodiak & Rotgrowl', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Trioch the Devourer', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Karrsh the Sentinel', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Chieftain Partath', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Archdruid Kronn', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Selenaxx Foulheart', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Loktanag the Vile', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Ormanos the Cracked', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Ursol', 3),
    ('nightmare-of-ursol', 1, 'Timbermaw Hold', 'Peroth''arn', 8),
    ('vanilla', 1, 'Naxxramas', 'Anub''Rekhan', 3),
    ('vanilla', 1, 'Naxxramas', 'Grand Widow Faerlina', 3),
    ('vanilla', 1, 'Naxxramas', 'Maexxna', 3),
    ('vanilla', 1, 'Naxxramas', 'Noth the Plaguebringer', 3),
    ('vanilla', 1, 'Naxxramas', 'Heigan the Unclean', 3),
    ('vanilla', 1, 'Naxxramas', 'Loatheb', 3),
    ('vanilla', 1, 'Naxxramas', 'Instructor Razuvious', 3),
    ('vanilla', 1, 'Naxxramas', 'Gothik the Harvester', 3),
    ('vanilla', 1, 'Naxxramas', 'Four Horsemen', 3),
    ('vanilla', 1, 'Naxxramas', 'Patchwerk', 3),
    ('vanilla', 1, 'Naxxramas', 'Grobbulus', 3),
    ('vanilla', 1, 'Naxxramas', 'Gluth', 3),
    ('vanilla', 1, 'Naxxramas', 'Thaddius', 3),
    ('vanilla', 1, 'Naxxramas', 'Sapphiron', 3),
    ('vanilla', 1, 'Naxxramas', 'Kel''Thuzad', 8),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Keeper Gnarlmoon', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Anomalus', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Rupturan the Broken', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Mephistroth', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Ley-Watcher Incantagos', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Echo of Medivh', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'King', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Sanv Tas''dal', 6),
    ('nightmare-of-ursol', 1, 'Upper Tower of Karazhan', 'Kruul', 7),
    ('vanilla', 1, 'Molten Core', 'Gehennas', 1);

-- Only a newly created explicit group policy receives defaults. Existing policy rows
-- and their admin overrides are never updated by this trigger. Turtle combines
-- vanilla with nightmare-of-ursol, replacing vanilla's Gehennas with custom MC bosses.
CREATE FUNCTION apply_rating_renown_template() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    selected_flavors TEXT[];
BEGIN
    SELECT CASE
        WHEN server.id = '10ac9e23-ff74-43ed-83ad-96c123017097'::uuid
            OR 'nightmare-of-ursol' = ANY(dataset.default_flavor)
            THEN ARRAY['vanilla', 'nightmare-of-ursol']::text[]
        WHEN 'vanilla' = ANY(dataset.default_flavor) THEN ARRAY['vanilla']::text[]
        ELSE '{}'::text[] END INTO selected_flavors
    FROM rating_realm_groups grp
    JOIN wow_servers server ON server.id = grp.server_id
    LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
    LEFT JOIN datasets dataset ON dataset.id = COALESCE(server.default_dataset_id, tenant.default_dataset_id)
    WHERE grp.id = NEW.group_id;

    IF cardinality(selected_flavors) > 0 THEN
        INSERT INTO rating_group_raid_policies (group_id, instance_name, peak_weight, mastery_weight)
        SELECT NEW.group_id, boss.instance_name, 1, 1
        FROM rating_renown_template_bosses boss
        WHERE boss.flavor = ANY(selected_flavors)
          AND boss.version = (SELECT max(version) FROM rating_renown_templates WHERE flavor = boss.flavor)
          AND NOT (boss.instance_name = 'Molten Core' AND boss.encounter_name = 'Gehennas'
                   AND 'nightmare-of-ursol' = ANY(selected_flavors))
        GROUP BY boss.instance_name
        ON CONFLICT (group_id, instance_name) DO NOTHING;

        INSERT INTO rating_group_boss_policies
            (group_id, instance_name, encounter_name, peak_weight, mastery_weight, renown_points)
        SELECT NEW.group_id, boss.instance_name, boss.encounter_name, 1, 1, boss.renown_points
        FROM rating_renown_template_bosses boss
        WHERE boss.flavor = ANY(selected_flavors)
          AND boss.version = (SELECT max(version) FROM rating_renown_templates WHERE flavor = boss.flavor)
          AND NOT (boss.instance_name = 'Molten Core' AND boss.encounter_name = 'Gehennas'
                   AND 'nightmare-of-ursol' = ANY(selected_flavors))
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
