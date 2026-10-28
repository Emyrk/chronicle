-- A short summary shown in addon lists and on the addon page. Set from the addon page, not the manifest.
-- lua_projects holds one row per addon, so the default and check are cheap at startup.
ALTER TABLE lua_projects ADD COLUMN description text NOT NULL DEFAULT ''
  CONSTRAINT lua_projects_description_length CHECK (char_length(description) <= 300);
