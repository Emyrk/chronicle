BEGIN;

-- Preserve the existing templates; newly configured Vanilla Plus policies
-- receive both custom ZG bosses at one Renown point each.
INSERT INTO rating_renown_templates (flavor, version) VALUES ('vanillaplus', 3);
INSERT INTO rating_renown_template_bosses
    (flavor, version, instance_name, encounter_name, renown_points)
SELECT flavor, 3, instance_name, encounter_name, renown_points
FROM rating_renown_template_bosses
WHERE flavor = 'vanillaplus' AND version = 2;
INSERT INTO rating_renown_template_bosses
    (flavor, version, instance_name, encounter_name, renown_points)
VALUES ('vanillaplus', 3, 'Zul''Gurub', 'Azus the Bloodseeker', 1);

COMMIT;
