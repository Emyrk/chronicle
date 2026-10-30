-- Flavor tags a module needs from the site (vanilla, tbc, wrath, nightmare-of-ursol). Empty fits every site.
-- A constant default is metadata-only, so this is cheap at startup.
ALTER TABLE lua_projects ADD COLUMN flavor text[] NOT NULL DEFAULT '{}';
