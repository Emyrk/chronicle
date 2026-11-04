BEGIN;

-- A single tenant-wide denominator per boss/cohort/window. This is separate
-- from any realm or subject: guildless clean kills also affect guild rank one.
-- Existing generations fall back to their frozen per-row rank_one_raw until
-- the bounded evidence bootstrap has reconciled that cohort.
CREATE TABLE rating_peak_cohort_denominators (
    generation_id UUID NOT NULL,
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
    PRIMARY KEY (generation_id, tenant_id, subject_kind, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec,
                 performance_metric, window_kind),
    FOREIGN KEY (generation_id, tenant_id) REFERENCES rating_score_generations(id, tenant_id) ON DELETE CASCADE,
    CHECK ((window_kind = 'period' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_start < window_end)
        OR (window_kind = 'all_time' AND window_start IS NULL AND window_end IS NULL))
);
CREATE INDEX rating_peak_cohort_denominators_tenant_idx
    ON rating_peak_cohort_denominators (tenant_id, subject_kind, window_kind);
ALTER TABLE rating_peak_cohort_denominators ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_peak_cohort_denominators FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_peak_cohort_denominators
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_peak_cohort_denominators
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));

-- Incremental Mastery/Peak must not read a partial live history on existing
-- tenants. A bounded bootstrap scans canonical runs before activating writers.
CREATE TABLE rating_live_evidence_bootstraps (
    tenant_id UUID PRIMARY KEY,
    after_run_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    source_cutoff TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rating_live_evidence_bootstraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_live_evidence_bootstraps FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_live_evidence_bootstraps
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_live_evidence_bootstraps
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;
