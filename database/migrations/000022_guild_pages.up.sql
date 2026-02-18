-- Guild membership (links users who can edit a guild's page)
CREATE TABLE guild_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(guild_id, user_id)
);

CREATE INDEX idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX idx_guild_members_user ON guild_members(user_id);

-- Guild page configuration
CREATE TABLE guild_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE UNIQUE,
    theme JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Page tabs (multiple pages within a guild page)
CREATE TABLE guild_page_tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES guild_pages(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    slug TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(page_id, slug)
);

CREATE INDEX idx_guild_page_tabs_page ON guild_page_tabs(page_id);

-- Panel instances on tabs
CREATE TABLE guild_page_panels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tab_id UUID NOT NULL REFERENCES guild_page_tabs(id) ON DELETE CASCADE,
    panel_type TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "w": 6, "h": 2}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guild_page_panels_tab ON guild_page_panels(tab_id);
