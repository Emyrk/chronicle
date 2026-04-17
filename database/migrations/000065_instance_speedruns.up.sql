CREATE TABLE instance_speedruns (
    instance_id UUID PRIMARY KEY REFERENCES log_instances(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID REFERENCES guilds(id),
    qualified BOOLEAN NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    completion_time TIMESTAMPTZ NOT NULL,
    duration_ms BIGINT NOT NULL,
    proof JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leaderboard: qualified runs ordered by duration
CREATE INDEX idx_instance_speedruns_leaderboard
    ON instance_speedruns (instance_name, duration_ms)
    WHERE qualified = true;

-- Lookup by realm
CREATE INDEX idx_instance_speedruns_realm
    ON instance_speedruns (realm_id, instance_name);
