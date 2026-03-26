CREATE TABLE guild_settings (
    guild_id UUID PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
    allow_join_requests_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guild_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(guild_id, user_id)
);
CREATE INDEX idx_guild_join_requests_guild ON guild_join_requests(guild_id);
