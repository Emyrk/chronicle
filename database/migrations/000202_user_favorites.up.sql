BEGIN;

CREATE TABLE user_favorite_guilds (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_scope_id UUID GENERATED ALWAYS AS (
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::UUID)
  ) STORED,
  slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, guild_id),
  CONSTRAINT user_favorite_guilds_slot_per_tenant
    UNIQUE (user_id, tenant_scope_id, slot)
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
