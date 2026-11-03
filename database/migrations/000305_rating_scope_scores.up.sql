BEGIN;

-- The eligible boss manifest remains in rating_group_boss_policies. Every
-- eligible raid also needs explicit weights for portfolio-level comparisons.
CREATE TABLE rating_group_raid_policies (
    group_id UUID NOT NULL REFERENCES rating_group_policies(group_id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL,
    peak_weight DOUBLE PRECISION NOT NULL CHECK (peak_weight > 0),
    mastery_weight DOUBLE PRECISION NOT NULL CHECK (mastery_weight > 0),
    PRIMARY KEY (group_id, instance_name)
);
ALTER TABLE rating_group_raid_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_group_raid_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_group_raid_policies
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_group_raid_policies
    USING (group_id IN (SELECT id FROM rating_realm_groups));
CREATE TRIGGER rating_raid_policy_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE
    ON rating_group_raid_policies FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_raid_policy_version AFTER INSERT OR UPDATE OR DELETE
    ON rating_group_raid_policies FOR EACH ROW EXECUTE FUNCTION bump_rating_group_policy_version();

-- A generated, replaceable current projection. instance_name is empty for
-- portfolio totals, preserving one current row per applicable character/cohort.
CREATE TABLE rating_scope_scores (
    generation_id UUID NOT NULL REFERENCES rating_score_generations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    group_id UUID NOT NULL REFERENCES rating_realm_groups(id),
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
    player_guid TEXT NOT NULL,
    instance_name TEXT NOT NULL DEFAULT '',
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    player_class TEXT NOT NULL DEFAULT '',
    player_spec TEXT NOT NULL DEFAULT '',
    player_sub_spec TEXT NOT NULL DEFAULT '',
    performance_metric TEXT NOT NULL CHECK (performance_metric IN ('dps', 'hps', 'none')),
    rating_metric TEXT NOT NULL CHECK (rating_metric IN ('peak','mastery','ranked_mastery','renown')),
    window_kind TEXT NOT NULL CHECK (window_kind IN ('period','all_time','career')),
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (generation_id, group_id, realm_id, player_guid, instance_name,
                 difficulty_name, max_players, player_class, player_spec,
                 player_sub_spec, performance_metric, rating_metric, window_kind)
);
CREATE INDEX rating_scope_scores_board_idx ON rating_scope_scores (
    generation_id, group_id, instance_name, rating_metric, window_kind,
    performance_metric, difficulty_name, max_players, player_class,
    player_spec, player_sub_spec, score DESC, realm_id, player_guid
);
ALTER TABLE rating_scope_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_scope_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_scope_scores
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_scope_scores
    USING (realm_id IN (SELECT id FROM wow_server_realms));

COMMIT;
