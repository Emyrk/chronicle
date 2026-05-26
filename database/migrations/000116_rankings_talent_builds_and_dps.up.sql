-- talent_builds: deduplicated talent tree layouts, nameable for sub-spec grouping.
CREATE TABLE talent_builds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_class    TEXT NOT NULL,
    talent_summary  SMALLINT[] NOT NULL,
    talent_layout   TEXT NOT NULL,
    spec            TEXT NOT NULL DEFAULT 'Unknown',
    sub_spec        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (player_class, talent_layout)
);

CREATE INDEX idx_tb_class_spec ON talent_builds (player_class, spec);
CREATE INDEX idx_tb_sub_spec ON talent_builds (sub_spec) WHERE sub_spec IS NOT NULL;

-- encounter_dps_rankings: materialized per-player per-encounter DPS data.
CREATE TABLE encounter_dps_rankings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id    UUID NOT NULL REFERENCES log_instance_encounters(id) ON DELETE CASCADE,
    instance_id     UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    encounter_name  TEXT NOT NULL,
    instance_name   TEXT NOT NULL,
    player_guid     TEXT NOT NULL,
    player_name     TEXT NOT NULL,
    player_class    TEXT NOT NULL DEFAULT 'Unknown',
    player_spec     TEXT NOT NULL DEFAULT 'Unknown',
    talent_build_id UUID REFERENCES talent_builds(id),
    realm_id        UUID NOT NULL REFERENCES wow_server_realms(id),
    realm_name      TEXT NOT NULL,
    guild_id        UUID REFERENCES guilds(id),
    guild_name      TEXT NOT NULL DEFAULT '',
    damage_done     BIGINT NOT NULL,
    duration_secs   DOUBLE PRECISION NOT NULL,
    dps             DOUBLE PRECISION NOT NULL,
    avg_ilvl        SMALLINT,
    log_hashed_slug TEXT NOT NULL DEFAULT '',
    killed_at       TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (encounter_id, player_guid)
);

CREATE INDEX idx_edr_instance_name ON encounter_dps_rankings (instance_name);
CREATE INDEX idx_edr_encounter_name ON encounter_dps_rankings (encounter_name);
CREATE INDEX idx_edr_dps_desc ON encounter_dps_rankings (encounter_name, dps DESC);
CREATE INDEX idx_edr_realm ON encounter_dps_rankings (realm_id);
CREATE INDEX idx_edr_killed_at ON encounter_dps_rankings (killed_at);
CREATE INDEX idx_edr_class_spec ON encounter_dps_rankings (player_class, player_spec);

-- RLS policies for tenant isolation.
ALTER TABLE encounter_dps_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounter_dps_rankings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_bypass ON encounter_dps_rankings
    USING (current_setting('app.tenant_bypass', true) = 'true');

CREATE POLICY tenant_isolation ON encounter_dps_rankings
    USING (realm_id IN (SELECT id FROM wow_server_realms));
