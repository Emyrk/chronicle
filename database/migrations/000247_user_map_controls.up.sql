-- Per-user replay map camera keybinds. A missing row means the defaults.
CREATE TABLE user_map_controls (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  controls jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
