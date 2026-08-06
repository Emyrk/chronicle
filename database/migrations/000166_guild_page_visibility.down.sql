BEGIN;

ALTER TABLE guild_page_panels DROP COLUMN IF EXISTS visibility;
ALTER TABLE guild_page_tabs DROP COLUMN IF EXISTS visibility;

COMMIT;
