BEGIN;

DELETE FROM rating_renown_template_bosses WHERE flavor = 'vanillaplus' AND version = 3;
DELETE FROM rating_renown_templates WHERE flavor = 'vanillaplus' AND version = 3;

COMMIT;
