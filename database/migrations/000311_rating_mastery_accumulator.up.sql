BEGIN;

-- One bounded row per generation, subject, cohort and scoring window. The four
-- passes replay immutable stage observations; no individual parse is stored here.
-- The tenant and generation pair is checked so callers cannot mix rebuilds.
CREATE TABLE rating_mastery_accumulators (
    generation_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('player', 'guild')),
    realm_id UUID NOT NULL,
    subject_id TEXT NOT NULL CHECK (length(subject_id) > 0),
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL DEFAULT '',
    player_spec TEXT NOT NULL DEFAULT '',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    performance_metric TEXT NOT NULL CHECK (performance_metric IN ('dps', 'hps', 'none')),
    window_kind TEXT NOT NULL CHECK (window_kind IN ('period', 'all_time')),
    -- count -> latest -> weight -> quantile -> complete. Each pass restarts at
    -- the beginning. Position counts all eligible rows, including dropped lows.
    pass TEXT NOT NULL DEFAULT 'count' CHECK (pass IN ('count', 'latest', 'weight', 'quantile', 'complete')),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    cursor_score DOUBLE PRECISION,
    cursor_killed_at TIMESTAMPTZ,
    cursor_run_id UUID,
    position BIGINT NOT NULL DEFAULT 0 CHECK (position >= 0),
    eligible_kills BIGINT NOT NULL DEFAULT 0 CHECK (eligible_kills >= 0),
    excluded_kills BIGINT NOT NULL DEFAULT 0 CHECK (excluded_kills >= 0 AND excluded_kills <= eligible_kills),
    best DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (best >= 0 AND best <= 100),
    latest_retained_at TIMESTAMPTZ,
    total_weight DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_weight >= 0 AND total_weight < 'Infinity'::float8),
    cumulative_weight DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (cumulative_weight >= 0 AND cumulative_weight < 'Infinity'::float8),
    floor_score DOUBLE PRECISION,
    form_score DOUBLE PRECISION,
    last_retained_score DOUBLE PRECISION,
    PRIMARY KEY (generation_id, subject_kind, realm_id, subject_id, instance_name,
                 encounter_name, difficulty_name, max_players, player_class,
                 player_spec, player_sub_spec, performance_metric, window_kind),
    FOREIGN KEY (generation_id, tenant_id) REFERENCES rating_rebuild_checkpoints(generation_id, tenant_id) ON DELETE CASCADE,
    CHECK ((cursor_score IS NULL AND cursor_killed_at IS NULL AND cursor_run_id IS NULL)
        OR (cursor_score BETWEEN 0 AND 100 AND cursor_killed_at IS NOT NULL AND cursor_run_id IS NOT NULL)),
    CHECK (floor_score IS NULL OR floor_score BETWEEN 0 AND 100),
    CHECK (form_score IS NULL OR form_score BETWEEN 0 AND 100),
    CHECK (last_retained_score IS NULL OR last_retained_score BETWEEN 0 AND 100),
    CHECK ((subject_kind = 'guild' AND performance_metric = 'none' AND player_class = '' AND player_spec = '' AND player_sub_spec = '')
        OR (subject_kind = 'player' AND performance_metric IN ('dps', 'hps')))
);

ALTER TABLE rating_mastery_accumulators ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_mastery_accumulators FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_mastery_accumulators
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_mastery_accumulators
    USING (realm_id IN (SELECT id FROM wow_server_realms));

COMMIT;
