BEGIN;

-- Additive projections only. Existing Combined memberships, receipts and career
-- scores remain authoritative. No historical scan or backfill at startup.
CREATE TABLE parse_variant_memberships (
    LIKE parse_score_memberships INCLUDING DEFAULTS,
    encounter_variant TEXT NOT NULL CHECK (encounter_variant IN ('normal', 'hard')),
    PRIMARY KEY (id),
    UNIQUE (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid, difficulty_name, max_players, encounter_variant),
    FOREIGN KEY (instance_id) REFERENCES log_instances(id) ON DELETE CASCADE,
    FOREIGN KEY (log_group_id) REFERENCES wow_log_groups(id) ON DELETE CASCADE
);
CREATE INDEX parse_variant_memberships_cohort ON parse_variant_memberships
    (tenant_id, policy_version, query_version, encounter_name, difficulty_name, max_players, encounter_variant, player_class, player_spec, player_sub_spec, killed_at);
CREATE INDEX parse_variant_memberships_log_group ON parse_variant_memberships (log_group_id);
CREATE INDEX parse_variant_memberships_instance ON parse_variant_memberships (instance_id);

CREATE TABLE parse_variant_results (
    tenant_id UUID NOT NULL,
    instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    encounter_variant TEXT NOT NULL CHECK (encounter_variant IN ('normal', 'hard')),
    player_guid TEXT NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN ('dps', 'hps')),
    precise_score DOUBLE PRECISION NOT NULL,
    display_score SMALLINT NOT NULL,
    rank INTEGER NOT NULL,
    sample_size INTEGER NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (tenant_id, instance_id, encounter_name, difficulty_name, max_players, encounter_variant, player_guid, metric)
);
CREATE INDEX parse_variant_results_instance ON parse_variant_results (instance_id);
COMMIT;
