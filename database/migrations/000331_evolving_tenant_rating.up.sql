BEGIN;

-- Empty, generation-free serving projections. No historical rows are copied.
CREATE TABLE player_tenant_rating_boss_scores_evolving (
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
    best_duration_secs DOUBLE PRECISION,
    form DOUBLE PRECISION,
    floor_score DOUBLE PRECISION,
    eligible_kills INT NOT NULL DEFAULT 0 CHECK (eligible_kills >= 0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, realm_id, player_guid, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind),
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX player_tenant_rating_boss_scores_evolving_board_idx ON player_tenant_rating_boss_scores_evolving (
    tenant_id, instance_name, encounter_name, difficulty_name, max_players,
    rating_metric, window_kind, player_class, player_spec,
        player_sub_spec, performance_metric, score DESC, realm_id, player_guid
);
CREATE INDEX player_tenant_rating_boss_scores_evolving_subject_idx ON player_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, player_guid, rating_metric, window_kind);
ALTER TABLE player_tenant_rating_boss_scores_evolving ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_tenant_rating_boss_scores_evolving FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON player_tenant_rating_boss_scores_evolving
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON player_tenant_rating_boss_scores_evolving
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE player_tenant_rating_scope_scores_evolving (
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
    best_raw DOUBLE PRECISION,
    best_duration_secs DOUBLE PRECISION,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, realm_id, player_guid, instance_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, performance_metric, rating_metric, window_kind),
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX player_tenant_rating_scope_scores_evolving_board_idx ON player_tenant_rating_scope_scores_evolving (
    tenant_id, instance_name, difficulty_name, max_players,
    rating_metric, window_kind, player_class, player_spec,
        player_sub_spec, performance_metric, score DESC, realm_id, player_guid
);
CREATE INDEX player_tenant_rating_scope_scores_evolving_subject_idx ON player_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, player_guid, rating_metric, window_kind);
ALTER TABLE player_tenant_rating_scope_scores_evolving ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_tenant_rating_scope_scores_evolving FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON player_tenant_rating_scope_scores_evolving
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON player_tenant_rating_scope_scores_evolving
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE guild_tenant_rating_boss_scores_evolving (
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
    PRIMARY KEY (tenant_id, realm_id, guild_id, instance_name, encounter_name,
                 difficulty_name, max_players, rating_metric, window_kind),
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX guild_tenant_rating_boss_scores_evolving_board_idx ON guild_tenant_rating_boss_scores_evolving (
    tenant_id, instance_name, encounter_name, difficulty_name, max_players,
    rating_metric, window_kind, score DESC, realm_id, guild_id
);
CREATE INDEX guild_tenant_rating_boss_scores_evolving_subject_idx ON guild_tenant_rating_boss_scores_evolving
    (tenant_id, realm_id, guild_id, rating_metric, window_kind);
ALTER TABLE guild_tenant_rating_boss_scores_evolving ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_tenant_rating_boss_scores_evolving FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON guild_tenant_rating_boss_scores_evolving
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON guild_tenant_rating_boss_scores_evolving
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE guild_tenant_rating_scope_scores_evolving (
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
    PRIMARY KEY (tenant_id, realm_id, guild_id, instance_name,
                 difficulty_name, max_players, rating_metric, window_kind),
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX guild_tenant_rating_scope_scores_evolving_board_idx ON guild_tenant_rating_scope_scores_evolving (
    tenant_id, instance_name, difficulty_name, max_players,
    rating_metric, window_kind, score DESC, realm_id, guild_id
);
CREATE INDEX guild_tenant_rating_scope_scores_evolving_subject_idx ON guild_tenant_rating_scope_scores_evolving
    (tenant_id, realm_id, guild_id, rating_metric, window_kind);
ALTER TABLE guild_tenant_rating_scope_scores_evolving ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_tenant_rating_scope_scores_evolving FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON guild_tenant_rating_scope_scores_evolving
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON guild_tenant_rating_scope_scores_evolving
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                     '00000000-0000-0000-0000-000000000000'::uuid));


CREATE TABLE rating_peak_cohort_denominators_evolving (
    tenant_id UUID NOT NULL,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('player', 'guild')),
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL DEFAULT '',
    player_spec TEXT NOT NULL DEFAULT '',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    performance_metric TEXT NOT NULL,
    window_kind TEXT NOT NULL CHECK (window_kind IN ('all_time', 'period')),
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    rank_one_raw DOUBLE PRECISION NOT NULL CHECK (rank_one_raw > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, subject_kind, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec,
                 performance_metric, window_kind),
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind = 'all_time' AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX rating_peak_cohort_denominators_evolving_tenant_idx
    ON rating_peak_cohort_denominators_evolving (tenant_id, subject_kind, window_kind);
ALTER TABLE rating_peak_cohort_denominators_evolving ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_peak_cohort_denominators_evolving FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_peak_cohort_denominators_evolving
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_peak_cohort_denominators_evolving
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));


CREATE TABLE rating_peak_cohort_pages_evolving (
    tenant_id UUID NOT NULL,
    subject_kind TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL,
    player_spec TEXT NOT NULL,
    player_sub_spec TEXT NOT NULL,
    performance_metric TEXT NOT NULL,
    revision BIGINT NOT NULL,
    after_realm_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    after_subject_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (tenant_id, subject_kind, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec,
                 player_sub_spec, performance_metric),
    FOREIGN KEY (tenant_id, subject_kind, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec,
                 player_sub_spec, performance_metric)
      REFERENCES rating_dirty_peak_cohorts (tenant_id, subject_kind, instance_name,
                 encounter_name, difficulty_name, max_players, player_class,
                 player_spec, player_sub_spec, performance_metric) ON DELETE CASCADE
);

ALTER TABLE rating_peak_cohort_pages_evolving ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_peak_cohort_pages_evolving FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_peak_cohort_pages_evolving
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_peak_cohort_pages_evolving
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));

-- Fixed rules for the evolving writer. The old rebuild function's inline
-- manifest literals are legacy-only until that writer is retired at cutover.
-- Resolve flavor awards at refresh time, not from rebuild checkpoints.
CREATE FUNCTION current_tenant_rating_policy(p_tenant_id UUID) RETURNS JSONB
LANGUAGE sql STABLE AS $$
WITH realm_flavors AS (
    SELECT realm.id AS realm_id,
        CASE WHEN server.id = '10ac9e23-ff74-43ed-83ad-96c123017097'::uuid
                  OR 'nightmare-of-ursol' = ANY(dataset.default_flavor)
                THEN ARRAY['vanilla', 'nightmare-of-ursol']::text[]
             WHEN 'vanillaplus' = ANY(dataset.default_flavor)
                THEN ARRAY['vanilla', 'vanillaplus']::text[]
             WHEN 'vanilla' = ANY(dataset.default_flavor) THEN ARRAY['vanilla']::text[]
             ELSE '{}'::text[] END AS flavors
    FROM wow_server_realms realm
    JOIN wow_servers server ON server.id = realm.server_id
    LEFT JOIN tenants tenant ON tenant.id = server.tenant_id
    LEFT JOIN datasets dataset ON dataset.id = COALESCE(server.default_dataset_id, tenant.default_dataset_id)
    WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = p_tenant_id
), awards AS (
    SELECT rf.realm_id, boss.instance_name, boss.encounter_name, boss.renown_points
    FROM realm_flavors rf
    JOIN rating_renown_template_bosses boss ON boss.flavor = ANY(rf.flavors)
    WHERE boss.version = (SELECT max(version) FROM rating_renown_templates WHERE flavor = boss.flavor)
      AND NOT (boss.instance_name = 'Molten Core' AND boss.encounter_name = 'Gehennas'
               AND 'nightmare-of-ursol' = ANY(rf.flavors))
)
SELECT jsonb_build_object(
    'writer', 'tenant', 'rules_version', 2,
    'tenant_policy', jsonb_build_object(
        'tenant_id', p_tenant_id, 'version', 2, 'period_days', 180,
        'best_weight', 0.35, 'form_weight', 0.50, 'floor_weight', 0.15,
        'rank_one_weight', 0.50, 'full_rank_kills', 5),
    'renown_bosses', COALESCE(jsonb_agg(jsonb_build_object(
        'realm_id', realm_id, 'instance_name', instance_name,
        'encounter_name', encounter_name, 'renown_points', renown_points)
        ORDER BY realm_id, instance_name, encounter_name), '[]'::jsonb)
) FROM awards;
$$;

COMMIT;
