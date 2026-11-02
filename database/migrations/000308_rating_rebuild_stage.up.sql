BEGIN;

-- Evidence belongs to the generation, not to live group membership. Membership
-- is applied from the checkpoint manifest during projection. Cascades retire it.
CREATE TABLE rating_stage_player_observations (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL,
    run_id UUID NOT NULL,
    player_guid TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL,
    player_spec TEXT NOT NULL,
    player_sub_spec TEXT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    performance_metric TEXT NOT NULL CHECK (performance_metric IN ('dps', 'hps')),
    raw_value DOUBLE PRECISION NOT NULL,
    locked_parse DOUBLE PRECISION,
    PRIMARY KEY (generation_id, run_id, player_guid, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric)
);
CREATE INDEX rating_stage_player_subject_idx ON rating_stage_player_observations
    (generation_id, realm_id, player_guid, instance_name, encounter_name, difficulty_name,
     max_players, player_class, player_spec, player_sub_spec, performance_metric,
     locked_parse DESC NULLS LAST, killed_at, run_id);
CREATE INDEX rating_stage_player_cohort_idx ON rating_stage_player_observations
    (generation_id, instance_name, encounter_name, difficulty_name, max_players,
     player_class, player_spec, player_sub_spec, performance_metric, raw_value DESC, run_id);

-- NULL guild is intentional: guild-less clean kills contribute to rank-one
-- comparison, but cannot be projected to a guild score.
CREATE TABLE rating_stage_guild_observations (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL,
    run_id UUID NOT NULL,
    guild_id UUID,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    raw_duration_ms DOUBLE PRECISION NOT NULL,
    locked_parse DOUBLE PRECISION,
    PRIMARY KEY (generation_id, run_id, encounter_name)
);
CREATE INDEX rating_stage_guild_subject_idx ON rating_stage_guild_observations
    (generation_id, realm_id, guild_id, instance_name, encounter_name, difficulty_name,
     max_players, locked_parse DESC NULLS LAST, killed_at, run_id);
CREATE INDEX rating_stage_guild_cohort_idx ON rating_stage_guild_observations
    (generation_id, instance_name, encounter_name, difficulty_name, max_players, raw_duration_ms, run_id);

CREATE TABLE rating_stage_player_renown (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL,
    player_guid TEXT NOT NULL,
    run_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    source_id UUID NOT NULL,
    PRIMARY KEY (generation_id, source_id)
);
CREATE INDEX rating_stage_player_renown_subject_idx ON rating_stage_player_renown
    (generation_id, realm_id, player_guid, instance_name, encounter_name, killed_at, source_id);
CREATE TABLE rating_stage_guild_renown (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL,
    guild_id UUID NOT NULL,
    run_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    source_id UUID NOT NULL,
    PRIMARY KEY (generation_id, source_id)
);
CREATE INDEX rating_stage_guild_renown_subject_idx ON rating_stage_guild_renown
    (generation_id, realm_id, guild_id, instance_name, encounter_name, killed_at, source_id);

-- Match the existing rating evidence tenant/RLS contract. The checkpoint and
-- generation are tenant-scoped; a realm must also remain visible to the caller.
ALTER TABLE rating_stage_player_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_stage_player_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_stage_player_observations USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_stage_player_observations USING (realm_id IN (SELECT id FROM wow_server_realms));
ALTER TABLE rating_stage_guild_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_stage_guild_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_stage_guild_observations USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_stage_guild_observations USING (realm_id IN (SELECT id FROM wow_server_realms));
ALTER TABLE rating_stage_player_renown ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_stage_player_renown FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_stage_player_renown USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_stage_player_renown USING (realm_id IN (SELECT id FROM wow_server_realms));
ALTER TABLE rating_stage_guild_renown ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_stage_guild_renown FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_stage_guild_renown USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_stage_guild_renown USING (realm_id IN (SELECT id FROM wow_server_realms));

COMMIT;
