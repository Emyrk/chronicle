BEGIN;

-- Durable earned facts, deliberately independent of source logs. Rebuilding a
-- rating projection or deleting a log never removes witnessed Renown history.
-- No backfill runs during startup: use an explicit bounded offline command.
CREATE TABLE renown_kill_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    player_guid TEXT NOT NULL,
    run_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (realm_id, player_guid, run_id, encounter_name)
);
CREATE INDEX renown_kill_facts_character_time_idx
    ON renown_kill_facts (realm_id, player_guid, killed_at, id);
CREATE INDEX renown_kill_facts_boss_idx
    ON renown_kill_facts (realm_id, instance_name, encounter_name, killed_at);

ALTER TABLE renown_kill_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE renown_kill_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON renown_kill_facts
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON renown_kill_facts
    USING (realm_id IN (SELECT id FROM wow_server_realms));

-- Build a generation before switching readers to it. A failed rebuild leaves
-- the previous active generation queryable and can be retried independently.
CREATE TABLE rating_score_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    policy_version INT NOT NULL,
    as_of TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'active', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rating_score_generations_active_idx
    ON rating_score_generations (tenant_id) WHERE status = 'active';

-- Final queryable projection: one row per character, metric, cohort, boss, and
-- window in a generation. The source evidence remains in existing ranking and
-- parse tables, or in renown_kill_facts when the source log was deleted.
CREATE TABLE rating_boss_scores (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
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
    score DOUBLE PRECISION NOT NULL,
    best_raw DOUBLE PRECISION,
    rank_one_raw DOUBLE PRECISION,
    best_locked_parse DOUBLE PRECISION,
    form DOUBLE PRECISION,
    floor_score DOUBLE PRECISION,
    eligible_kills INT NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, realm_id, player_guid, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec,
                 performance_metric, rating_metric, window_kind),
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind IN ('all_time', 'career') AND window_start IS NULL AND window_end IS NULL)),
    CHECK (eligible_kills >= 0 AND score >= 0)
);
CREATE INDEX rating_boss_scores_leaderboard_idx ON rating_boss_scores (
    generation_id, tenant_id, rating_metric, window_kind, instance_name,
    encounter_name, difficulty_name, max_players, player_class, player_spec,
    player_sub_spec, performance_metric, score DESC
);
CREATE INDEX rating_boss_scores_character_idx ON rating_boss_scores (
    realm_id, player_guid, generation_id, rating_metric, window_kind
);

ALTER TABLE rating_boss_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_boss_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_boss_scores
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_boss_scores
    USING (realm_id IN (SELECT id FROM wow_server_realms));

COMMIT;
