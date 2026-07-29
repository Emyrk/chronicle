-- Where a character link came from: 'manual' (admin/self managed) or an
-- external provider source like 'zug-zug/<url>'. Re-syncing an external
-- source deletes all links from that source and re-adds them, so different
-- provider URLs never collide with each other or with manual links.
ALTER TABLE user_character_links
  ADD COLUMN link_source TEXT NOT NULL DEFAULT 'manual';

-- Tracks the last sync per (user, source) to rate limit external requests
-- and to cache the provider's last result (linked/conflicts/unmatched) so
-- the UI can show why characters failed to link.
CREATE TABLE external_character_link_syncs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  -- Last ExternalSyncResponse returned to the user (jsonb, nullable while a
  -- sync is in flight or when the provider was unreachable).
  last_response jsonb,
  PRIMARY KEY (user_id, source)
);
