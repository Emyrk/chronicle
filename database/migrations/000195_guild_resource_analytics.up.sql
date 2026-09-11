BEGIN;

CREATE TABLE guild_resource_daily_stats (
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    resource_kind TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    viewed_on DATE NOT NULL,
    views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
    unique_visitors BIGINT NOT NULL DEFAULT 0 CHECK (unique_visitors >= 0),
    PRIMARY KEY (guild_id, resource_kind, resource_key, viewed_on)
);

CREATE INDEX guild_resource_daily_stats_guild_date_idx
    ON guild_resource_daily_stats (guild_id, viewed_on DESC);

CREATE TABLE guild_resource_recent_visitors (
    guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    resource_kind TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    visitor_id UUID NOT NULL,
    viewed_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, resource_kind, resource_key, visitor_id, viewed_on)
);

CREATE INDEX guild_resource_recent_visitors_date_idx
    ON guild_resource_recent_visitors (viewed_on);

COMMIT;
