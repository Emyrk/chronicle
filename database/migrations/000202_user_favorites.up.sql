BEGIN;

CREATE TABLE user_favorite_guilds (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, guild_id)
);

CREATE TABLE user_favorite_players (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_guid wow_guid NOT NULL,
  realm_id UUID NOT NULL REFERENCES wow_server_realms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, character_guid, realm_id),
  FOREIGN KEY (character_guid, realm_id)
    REFERENCES game_players(id, realm_id) ON DELETE CASCADE
);

COMMIT;
