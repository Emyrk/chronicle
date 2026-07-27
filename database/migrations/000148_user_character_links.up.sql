CREATE TABLE user_character_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_guid wow_guid NOT NULL,
  realm_id UUID NOT NULL REFERENCES wow_server_realms(id) ON DELETE CASCADE,

  -- The user's "main" character. At most one per user (partial unique index below).
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  -- Audit: which user (admin) created the link.
  linked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (character_guid, realm_id)
    REFERENCES game_players(id, realm_id) ON DELETE CASCADE,

  -- Exclusivity: a character can be linked to at most one account.
  UNIQUE (character_guid, realm_id)
);

CREATE INDEX user_character_links_user_id ON user_character_links (user_id);

-- At most one primary character per user.
CREATE UNIQUE INDEX user_character_links_one_primary
  ON user_character_links (user_id) WHERE is_primary;
