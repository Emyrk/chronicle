BEGIN;

DROP TRIGGER IF EXISTS trg_cleanup_after_soft_delete ON user_panel_layouts;
DROP TRIGGER IF EXISTS trg_cleanup_after_untrack ON user_tracked_layouts;
DROP FUNCTION IF EXISTS cleanup_orphaned_layout();
DROP TABLE IF EXISTS user_tracked_layouts;

DROP INDEX IF EXISTS user_panel_layouts_user_title_ci_uidx;
CREATE UNIQUE INDEX user_panel_layouts_user_title_ci_uidx
  ON user_panel_layouts (user_id, title_normalized);

ALTER TABLE user_panel_layouts
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE user_panel_layouts
  DROP COLUMN IF EXISTS version;

COMMIT;
