-- Where a character link came from: 'manual' (admin/self managed) or an
-- external provider source like 'zug-zug/<url>'. Re-syncing an external
-- source deletes all links from that source and re-adds them, so different
-- provider URLs never collide with each other or with manual links.
ALTER TABLE user_character_links
  ADD COLUMN link_source TEXT NOT NULL DEFAULT 'manual';

-- Tracks the last sync per (user, source) to rate limit external requests.
CREATE TABLE external_character_link_syncs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source)
);
