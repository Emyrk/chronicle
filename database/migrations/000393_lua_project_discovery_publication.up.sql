BEGIN;

-- Constant default also covers existing modules without rewriting their rows.
ALTER TABLE lua_projects ADD COLUMN published boolean NOT NULL DEFAULT false;

COMMIT;
