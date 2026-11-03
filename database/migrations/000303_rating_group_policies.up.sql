BEGIN;

-- An explicit, versioned policy is required before a group can publish scores.
-- No weights or formula parameters are silently chosen at migration time.
CREATE TABLE rating_group_policies (
    group_id UUID PRIMARY KEY REFERENCES rating_realm_groups(id) ON DELETE CASCADE,
    version INT NOT NULL CHECK (version > 0),
    period_days INT NOT NULL CHECK (period_days BETWEEN 1 AND 3650),
    half_life_days DOUBLE PRECISION NOT NULL CHECK (half_life_days > 0 AND half_life_days <= 3650),
    best_weight DOUBLE PRECISION NOT NULL CHECK (best_weight >= 0),
    form_weight DOUBLE PRECISION NOT NULL CHECK (form_weight >= 0),
    floor_weight DOUBLE PRECISION NOT NULL CHECK (floor_weight >= 0),
    rank_one_weight DOUBLE PRECISION NOT NULL CHECK (rank_one_weight >= 0 AND rank_one_weight <= 1),
    full_rank_kills INT NOT NULL CHECK (full_rank_kills BETWEEN 1 AND 10000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (abs(best_weight + form_weight + floor_weight - 1) < 0.000000001)
);
CREATE TABLE rating_group_boss_policies (
    group_id UUID NOT NULL REFERENCES rating_group_policies(group_id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    peak_weight DOUBLE PRECISION NOT NULL CHECK (peak_weight > 0),
    mastery_weight DOUBLE PRECISION NOT NULL CHECK (mastery_weight > 0),
    renown_points DOUBLE PRECISION NOT NULL CHECK (renown_points >= 0),
    final_boss_bonus DOUBLE PRECISION NOT NULL CHECK (final_boss_bonus >= 0),
    PRIMARY KEY (group_id, instance_name, encounter_name)
);

-- Exactly one boss per raid may receive the designated final-boss bonus.
CREATE UNIQUE INDEX rating_group_final_boss_idx ON rating_group_boss_policies
    (group_id, instance_name) WHERE final_boss_bonus > 0;

-- Any eligibility/weight edit changes the policy version used by rebuilds.
CREATE FUNCTION bump_rating_group_policy_version() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        UPDATE rating_group_policies SET version = version + 1, updated_at = now()
        WHERE group_id = OLD.group_id;
        RETURN OLD;
    END IF;
    UPDATE rating_group_policies SET version = version + 1, updated_at = now()
    WHERE group_id = NEW.group_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER rating_boss_policy_version AFTER INSERT OR UPDATE OR DELETE
    ON rating_group_boss_policies FOR EACH ROW
    EXECUTE FUNCTION bump_rating_group_policy_version();

ALTER TABLE rating_group_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_group_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_group_policies
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_group_policies
    USING (group_id IN (SELECT id FROM rating_realm_groups));
ALTER TABLE rating_group_boss_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_group_boss_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_group_boss_policies
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_group_boss_policies
    USING (group_id IN (SELECT id FROM rating_realm_groups));

COMMIT;
