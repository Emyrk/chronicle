BEGIN;

ALTER TABLE user_panel_layouts
  DROP CONSTRAINT user_panel_layouts_title_format_chk,
  ADD CONSTRAINT user_panel_layouts_title_format_chk
    CHECK (title ~ '^[A-Za-z1-9_\-\s]+$');

COMMIT;
