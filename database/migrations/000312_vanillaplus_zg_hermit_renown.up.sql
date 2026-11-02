BEGIN;

-- Keep version 1 immutable. New Vanilla Plus policies inherit its boss awards
-- and add the canonical ZG encounter; existing admin-edited policies are untouched.
INSERT INTO rating_renown_templates (flavor, version) VALUES ('vanillaplus', 2);
INSERT INTO rating_renown_template_bosses
    (flavor, version, instance_name, encounter_name, renown_points)
SELECT flavor, 2, instance_name, encounter_name, renown_points
FROM rating_renown_template_bosses
WHERE flavor = 'vanillaplus' AND version = 1;
INSERT INTO rating_renown_template_bosses
    (flavor, version, instance_name, encounter_name, renown_points)
VALUES ('vanillaplus', 2, 'Zul''Gurub', 'The Nameless Hermit', 1);

COMMIT;
