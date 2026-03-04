BEGIN;

CREATE TABLE user_panel_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL,
  title_normalized text GENERATED ALWAYS AS (lower(title)) STORED,
  icon text NOT NULL DEFAULT 'INV_Misc_Book_09',
  description text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_panel_layouts_title_format_chk
    CHECK (title ~ '^[A-Za-z1-9_\-\s]+$'),
  CONSTRAINT user_panel_layouts_payload_size_chk
    CHECK (octet_length(payload::text) <= 10240)
);

CREATE UNIQUE INDEX user_panel_layouts_user_title_ci_uidx
  ON user_panel_layouts (user_id, title_normalized);

COMMIT;
