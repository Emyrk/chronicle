BEGIN;

ALTER TABLE user_panel_layouts
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE user_panel_layouts
  ALTER COLUMN user_id DROP NOT NULL;

DROP INDEX IF EXISTS user_panel_layouts_user_title_ci_uidx;
CREATE UNIQUE INDEX user_panel_layouts_user_title_ci_uidx
  ON user_panel_layouts (user_id, title_normalized)
  WHERE user_id IS NOT NULL;

CREATE TABLE user_tracked_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  layout_id uuid NOT NULL REFERENCES user_panel_layouts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_tracked_layouts_unique UNIQUE (user_id, layout_id)
);

CREATE OR REPLACE FUNCTION cleanup_orphaned_layout() RETURNS trigger AS $$
DECLARE
  check_layout_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'user_tracked_layouts' THEN
    check_layout_id := OLD.layout_id;
  ELSE
    check_layout_id := NEW.id;
  END IF;

  DELETE FROM user_panel_layouts
  WHERE id = check_layout_id
    AND user_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM user_tracked_layouts
      WHERE layout_id = check_layout_id
    );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_after_untrack
  AFTER DELETE ON user_tracked_layouts
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_orphaned_layout();

CREATE TRIGGER trg_cleanup_after_soft_delete
  AFTER UPDATE OF user_id ON user_panel_layouts
  FOR EACH ROW
  WHEN (NEW.user_id IS NULL)
  EXECUTE FUNCTION cleanup_orphaned_layout();

COMMIT;
