BEGIN;

-- Device visibility ('all', 'desktop', 'mobile') for guild page tabs and
-- panels. The API and editor always supported it; it was never persisted.
ALTER TABLE guild_page_tabs ADD COLUMN visibility text NOT NULL DEFAULT 'all';
ALTER TABLE guild_page_panels ADD COLUMN visibility text NOT NULL DEFAULT 'all';

COMMIT;
