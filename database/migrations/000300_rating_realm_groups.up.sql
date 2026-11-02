BEGIN;

-- Groups are current-state rating cohorts, not historical realm assignments.
-- The composite keys prevent assigning a realm to a group on another server.
ALTER TABLE wow_server_realms ADD CONSTRAINT wow_server_realms_id_server_id_unique UNIQUE (id, server_id);

CREATE TABLE rating_realm_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES wow_servers(id),
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    UNIQUE (server_id, name),
    UNIQUE (id, server_id)
);

CREATE TABLE rating_realm_group_memberships (
    realm_id UUID PRIMARY KEY,
    server_id UUID NOT NULL,
    group_id UUID NOT NULL,
    FOREIGN KEY (realm_id, server_id) REFERENCES wow_server_realms(id, server_id) ON DELETE CASCADE,
    FOREIGN KEY (group_id, server_id) REFERENCES rating_realm_groups(id, server_id)
);
CREATE INDEX rating_realm_group_memberships_group_idx
    ON rating_realm_group_memberships (group_id, realm_id);

-- Pin each score to the group policy under which it was computed. A realm
-- move must not expose its old group's score under the new group's name.
ALTER TABLE rating_boss_scores ADD COLUMN group_id UUID REFERENCES rating_realm_groups(id);
CREATE INDEX rating_boss_scores_group_idx ON rating_boss_scores
    (generation_id, group_id, rating_metric, window_kind, instance_name, encounter_name, score DESC);

ALTER TABLE rating_realm_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_realm_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_realm_groups
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_realm_groups
    USING (server_id IN (SELECT id FROM wow_servers));

ALTER TABLE rating_realm_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_realm_group_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_realm_group_memberships
    USING (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_realm_group_memberships
    USING (realm_id IN (SELECT id FROM wow_server_realms));

COMMIT;
