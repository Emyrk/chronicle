BEGIN;

-- Non-serving tenant-wide projections. Existing group tables, readers and
-- historical rows remain unchanged until the tenant writer/read cutover.
-- The composite FK prevents a projection from borrowing another tenant's
-- generation, even when an administrative writer bypasses RLS.
CREATE UNIQUE INDEX rating_score_generations_tenant_fk_idx
    ON rating_score_generations (id, tenant_id);

CREATE TABLE player_tenant_rating_boss_scores (
    generation_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    player_guid TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    player_class TEXT NOT NULL DEFAULT '',
    player_spec TEXT NOT NULL DEFAULT '',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    performance_metric TEXT NOT NULL CHECK (performance_metric IN ('dps', 'hps', 'none')),
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
    PRIMARY KEY (generation_id, tenant_id, realm_id, player_guid, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind),
    FOREIGN KEY (generation_id, tenant_id) REFERENCES rating_score_generations(id, tenant_id) ON DELETE CASCADE,
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX player_tenant_rating_boss_scores_board_idx ON player_tenant_rating_boss_scores (
    tenant_id, generation_id, instance_name, encounter_name, difficulty_name, max_players,
    rating_metric, window_kind, player_class, player_spec,
        player_sub_spec, performance_metric, score DESC, realm_id, player_guid
);
CREATE INDEX player_tenant_rating_boss_scores_subject_idx ON player_tenant_rating_boss_scores
    (tenant_id, realm_id, player_guid, generation_id, rating_metric, window_kind);
ALTER TABLE player_tenant_rating_boss_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_tenant_rating_boss_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON player_tenant_rating_boss_scores
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON player_tenant_rating_boss_scores
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE player_tenant_rating_scope_scores (
    generation_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    player_guid TEXT NOT NULL,
    instance_name TEXT NOT NULL DEFAULT '',
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    player_class TEXT NOT NULL DEFAULT '',
    player_spec TEXT NOT NULL DEFAULT '',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    performance_metric TEXT NOT NULL CHECK (performance_metric IN ('dps', 'hps', 'none')),
    rating_metric TEXT NOT NULL CHECK (rating_metric IN ('peak', 'mastery', 'ranked_mastery', 'renown')),
    window_kind TEXT NOT NULL CHECK (window_kind IN ('period', 'all_time', 'career')),
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, tenant_id, realm_id, player_guid, instance_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind),
    FOREIGN KEY (generation_id, tenant_id) REFERENCES rating_score_generations(id, tenant_id) ON DELETE CASCADE,
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX player_tenant_rating_scope_scores_board_idx ON player_tenant_rating_scope_scores (
    tenant_id, generation_id, instance_name, difficulty_name, max_players,
    rating_metric, window_kind, player_class, player_spec,
        player_sub_spec, performance_metric, score DESC, realm_id, player_guid
);
CREATE INDEX player_tenant_rating_scope_scores_subject_idx ON player_tenant_rating_scope_scores
    (tenant_id, realm_id, player_guid, generation_id, rating_metric, window_kind);
ALTER TABLE player_tenant_rating_scope_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_tenant_rating_scope_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON player_tenant_rating_scope_scores
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON player_tenant_rating_scope_scores
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE guild_tenant_rating_boss_scores (
    generation_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID NOT NULL REFERENCES guilds(id),
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
    PRIMARY KEY (generation_id, tenant_id, realm_id, guild_id, instance_name, encounter_name,
                 difficulty_name, max_players, rating_metric, window_kind),
    FOREIGN KEY (generation_id, tenant_id) REFERENCES rating_score_generations(id, tenant_id) ON DELETE CASCADE,
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX guild_tenant_rating_boss_scores_board_idx ON guild_tenant_rating_boss_scores (
    tenant_id, generation_id, instance_name, encounter_name, difficulty_name, max_players,
    rating_metric, window_kind, score DESC, realm_id, guild_id
);
CREATE INDEX guild_tenant_rating_boss_scores_subject_idx ON guild_tenant_rating_boss_scores
    (tenant_id, realm_id, guild_id, generation_id, rating_metric, window_kind);
ALTER TABLE guild_tenant_rating_boss_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_tenant_rating_boss_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON guild_tenant_rating_boss_scores
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON guild_tenant_rating_boss_scores
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE guild_tenant_rating_scope_scores (
    generation_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    guild_id UUID NOT NULL REFERENCES guilds(id),
    instance_name TEXT NOT NULL DEFAULT '',
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    rating_metric TEXT NOT NULL CHECK (rating_metric IN ('peak', 'mastery', 'ranked_mastery', 'renown')),
    window_kind TEXT NOT NULL CHECK (window_kind IN ('period', 'all_time', 'career')),
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, tenant_id, realm_id, guild_id, instance_name,
                 difficulty_name, max_players, rating_metric, window_kind),
    FOREIGN KEY (generation_id, tenant_id) REFERENCES rating_score_generations(id, tenant_id) ON DELETE CASCADE,
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX guild_tenant_rating_scope_scores_board_idx ON guild_tenant_rating_scope_scores (
    tenant_id, generation_id, instance_name, difficulty_name, max_players,
    rating_metric, window_kind, score DESC, realm_id, guild_id
);
CREATE INDEX guild_tenant_rating_scope_scores_subject_idx ON guild_tenant_rating_scope_scores
    (tenant_id, realm_id, guild_id, generation_id, rating_metric, window_kind);
ALTER TABLE guild_tenant_rating_scope_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_tenant_rating_scope_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON guild_tenant_rating_scope_scores
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON guild_tenant_rating_scope_scores
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;
