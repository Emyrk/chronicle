BEGIN;

-- Earned guild attendance is independent of the source log and its time parse.
-- Historical evidence is collected by an explicit bounded backfill, never here.
CREATE TABLE guild_renown_kill_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID NOT NULL REFERENCES guilds(id),
    run_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (realm_id, guild_id, run_id, encounter_name)
);
CREATE INDEX guild_renown_kill_facts_guild_time_idx
    ON guild_renown_kill_facts (tenant_id, realm_id, guild_id, killed_at, id);

CREATE TABLE guild_rating_boss_scores (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID NOT NULL REFERENCES guilds(id),
    group_id UUID NOT NULL REFERENCES rating_realm_groups(id),
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    rating_metric TEXT NOT NULL CHECK (rating_metric IN ('peak', 'mastery', 'ranked_mastery', 'renown')),
    window_kind TEXT NOT NULL CHECK (window_kind IN ('period', 'all_time', 'career')),
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0),
    best_raw DOUBLE PRECISION,
    rank_one_raw DOUBLE PRECISION,
    best_locked_parse DOUBLE PRECISION,
    form DOUBLE PRECISION,
    floor_score DOUBLE PRECISION,
    eligible_kills INT NOT NULL DEFAULT 0 CHECK (eligible_kills >= 0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, group_id, realm_id, guild_id, instance_name, encounter_name,
                 difficulty_name, max_players, rating_metric, window_kind),
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX guild_rating_boss_scores_board_idx ON guild_rating_boss_scores
    (generation_id, tenant_id, group_id, instance_name, encounter_name, difficulty_name,
     max_players, rating_metric, window_kind, score DESC, realm_id, guild_id);

-- Empty instance_name identifies the portfolio total, as in player scope scores.
CREATE TABLE guild_rating_scope_scores (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID NOT NULL REFERENCES guilds(id),
    group_id UUID NOT NULL REFERENCES rating_realm_groups(id),
    instance_name TEXT NOT NULL DEFAULT '',
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    rating_metric TEXT NOT NULL CHECK (rating_metric IN ('peak', 'mastery', 'ranked_mastery', 'renown')),
    window_kind TEXT NOT NULL CHECK (window_kind IN ('period', 'all_time', 'career')),
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, group_id, realm_id, guild_id, instance_name,
                 difficulty_name, max_players, rating_metric, window_kind)
);
CREATE INDEX guild_rating_scope_scores_board_idx ON guild_rating_scope_scores
    (generation_id, tenant_id, group_id, instance_name, difficulty_name, max_players,
     rating_metric, window_kind, score DESC, realm_id, guild_id);

ALTER TABLE guild_renown_kill_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_renown_kill_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON guild_renown_kill_facts USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON guild_renown_kill_facts USING (realm_id IN (SELECT id FROM wow_server_realms));
ALTER TABLE guild_rating_boss_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_rating_boss_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON guild_rating_boss_scores USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON guild_rating_boss_scores USING (realm_id IN (SELECT id FROM wow_server_realms));
ALTER TABLE guild_rating_scope_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_rating_scope_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON guild_rating_scope_scores USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON guild_rating_scope_scores USING (realm_id IN (SELECT id FROM wow_server_realms));

COMMIT;
